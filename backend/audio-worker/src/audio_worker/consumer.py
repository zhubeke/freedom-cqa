from __future__ import annotations

import json
import logging
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from threading import Event

from confluent_kafka import Consumer, KafkaError, Producer

from .analyzer import analyze
from .config import Settings
from .decoder import decode_audio
from .downloader import download_audio
from .models import AudioMetrics, AudioRequestedEvent
from .repository import AudioRepository

logger = logging.getLogger(__name__)


class AudioConsumer:
    def __init__(self, settings: Settings, repository: AudioRepository):
        self.settings = settings
        self.repository = repository
        self.stop_event = Event()
        self.consumer = Consumer({"bootstrap.servers": settings.brokers, "group.id": settings.consumer_group, "enable.auto.commit": False, "auto.offset.reset": "earliest"})
        self.producer = Producer({"bootstrap.servers": settings.brokers, "client.id": "cqa-audio-worker"})
        self.ready = False

    def run(self) -> None:
        self.consumer.subscribe([self.settings.requested_topic])
        self.ready = True
        try:
            while not self.stop_event.is_set():
                message = self.consumer.poll(1.0)
                if message is None:
                    continue
                if message.error():
                    if message.error().code() != KafkaError._PARTITION_EOF:
                        logger.error("Kafka consumer error: %s", message.error())
                    continue
                try:
                    event = AudioRequestedEvent.model_validate_json(message.value())
                    self.process(event)
                    self.consumer.commit(message=message, asynchronous=False)
                except Exception as exc:  # persistence of failure makes the event durably handled
                    logger.exception("Audio event failed for topic=%s partition=%s offset=%s", message.topic(), message.partition(), message.offset())
                    try:
                        event = AudioRequestedEvent.model_validate_json(message.value())
                        self.repository.fail(event, str(exc))
                        self._publish(event, "failed")
                        self.consumer.commit(message=message, asynchronous=False)
                    except Exception:
                        logger.exception("Could not persist audio processing failure; offset will not be committed")
        finally:
            self.ready = False
            self.consumer.close()
            self.producer.flush(10)

    def process(self, event: AudioRequestedEvent) -> None:
        conversation = self.repository.conversation(event)
        if not conversation or not conversation.get("audio_url"):
            raise RuntimeError("Conversation has no available audio URL")
        with tempfile.TemporaryDirectory(prefix="cqa-audio-") as folder:
            source = Path(folder) / "source.media"
            decoded = Path(folder) / "decoded.wav"
            last_download_error: Exception | None = None
            for attempt in range(3):
                try:
                    download_audio(str(conversation["audio_url"]), source, self.settings)
                    last_download_error = None
                    break
                except Exception as exc:
                    last_download_error = exc
                    if attempt < 2:
                        time.sleep(0.5 * (2 ** attempt))
            if last_download_error is not None:
                raise last_download_error
            samples, sample_rate, channels = decode_audio(source, decoded)
            values = analyze(samples, sample_rate)
            metrics = AudioMetrics(
                dataset_group_id=event.dataset_group_id,
                conversation_id=event.conversation_id,
                processor_version=self.settings.processor_version,
                sample_rate=sample_rate,
                channel_count=channels,
                processed_at=datetime.now(timezone.utc),
                **values,
            )
            self.repository.save(metrics, event.event_id)
            self._publish(event, "completed")

    def _publish(self, event: AudioRequestedEvent, status: str) -> None:
        payload = {"event_id": f"analyzed:{event.event_id}", "event_type": "cqa.audio.analyzed", "event_version": 1, "occurred_at": datetime.now(timezone.utc).isoformat(), "dataset_group_id": event.dataset_group_id, "conversation_id": event.conversation_id, "processor_version": self.settings.processor_version, "status": status}
        self.producer.produce(self.settings.analyzed_topic, key=f"{event.dataset_group_id}:{event.conversation_id}", value=json.dumps(payload))
        remaining = self.producer.flush(10)
        if remaining:
            raise RuntimeError("Audio analyzed event could not be published")

    def stop(self) -> None:
        self.stop_event.set()

