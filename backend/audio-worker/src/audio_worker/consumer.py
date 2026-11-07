from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from threading import Event
from confluent_kafka import Consumer, KafkaError, Producer

from .config import Settings
from .models import AudioErrorCode, AudioPipelineError, AudioRequestedEvent

logger=logging.getLogger(__name__)


class AudioConsumer:
    def __init__(self, settings: Settings, repository, service):
        self.settings=settings; self.repository=repository; self.service=service; self.stop_event=Event(); self.ready=False
        self.consumer=Consumer({"bootstrap.servers":settings.brokers,"group.id":settings.consumer_group,"enable.auto.commit":False,"auto.offset.reset":"earliest","max.poll.interval.ms":86_400_000})
        self.producer=Producer({"bootstrap.servers":settings.brokers,"client.id":"cqa-audio-worker","enable.idempotence":True})

    def run(self) -> None:
        self.consumer.subscribe([self.settings.requested_topic]); self.ready=True
        try:
            while not self.stop_event.is_set():
                message=self.consumer.poll(1)
                if message is None: continue
                if message.error():
                    if message.error().code()!=KafkaError._PARTITION_EOF: logger.error("Kafka consumer error code=%s",message.error().code())
                    continue
                try:
                    event=AudioRequestedEvent.model_validate_json(message.value())
                    if self.repository.event_complete(event.event_id):
                        self.consumer.commit(message=message,asynchronous=False); continue
                    previous=self.repository.job(event.event_id)
                    if previous and previous.get("status") in {"completed","partial","failed","unavailable"}:
                        self._publish(event,previous["status"],previous.get("audio_metrics_id"),previous.get("error_code"))
                        self.repository.mark_published(event.event_id)
                        self.consumer.commit(message=message,asynchronous=False); continue
                    self.repository.mark_processing(event)
                    result=self.service.analyze(event); metrics_id=self.repository.save(result,event)
                    self._publish(event,result.status,metrics_id,None)
                    self.repository.mark_published(event.event_id)
                    self.consumer.commit(message=message,asynchronous=False)
                except Exception as exc:
                    try:
                        event=AudioRequestedEvent.model_validate_json(message.value())
                        code=exc.code.value if isinstance(exc,AudioPipelineError) else AudioErrorCode.ANALYSIS_FAILED.value
                        safe_message=str(exc)[:500]
                        unavailable=code in {"AUDIO_NOT_AVAILABLE","AUDIO_MODEL_UNAVAILABLE","AUDIO_URL_EXPIRED","AUDIO_ACCESS_DENIED"}
                        self.repository.fail(event,code,safe_message); self._publish(event,"unavailable" if unavailable else "failed",None,code)
                        self.repository.mark_published(event.event_id)
                        self.consumer.commit(message=message,asynchronous=False)
                    except Exception: logger.exception("Audio failure could not be durably handled; offset retained")
        finally:
            self.ready=False; self.consumer.close(); self.producer.flush(10)

    def _publish(self,event,status,metrics_id,error_code):
        payload={"event_id":str(uuid.uuid4()),"event_type":"cqa.audio.analyzed","event_version":1,"occurred_at":datetime.now(timezone.utc).isoformat(),"correlation_id":event.correlation_id or event.event_id,"conversation_id":event.conversation_id,"analysis_run_id":event.analysis_run_id,"status":status,"audio_metrics_id":metrics_id,"error_code":error_code}
        self.producer.produce(self.settings.analyzed_topic,key=f"{event.dataset_group_id}:{event.conversation_id}",value=json.dumps(payload)); remaining=self.producer.flush(10)
        if remaining: raise RuntimeError("Audio analyzed event could not be published")

    def stop(self): self.stop_event.set()
