from __future__ import annotations

from datetime import datetime, timezone
from pymongo import ReturnDocument
from pymongo.database import Database
from .models import AudioAnalysisResult, AudioRequestedEvent


class AudioRepository:
    def __init__(self, database: Database):
        self.database=database; self.metrics=database["audio_metrics"]; self.jobs=database["audio_jobs"]; self.outbox=database["audio_outbox"]

    def ensure_indexes(self) -> None:
        if "audio_metrics_version_unique" in self.metrics.index_information():
            self.metrics.drop_index("audio_metrics_version_unique")
        self.metrics.create_index([("dataset_group_id",1),("conversation_id",1),("processing_completed_at",-1)], name="audio_conversation_lookup")
        self.metrics.create_index([("analysis_fingerprint",1),("processing_completed_at",-1)], name="audio_fingerprint_lookup")
        self.metrics.create_index("analysis_run_id", unique=True, name="audio_run_unique")
        self.jobs.create_index("source_event_id", unique=True, name="audio_event_idempotency")
        self.jobs.create_index([("status",1),("updated_at",-1)], name="audio_job_status")
        self.outbox.create_index([("published_at",1),("created_at",1)], name="audio_outbox_pending")

    def conversation(self, event: AudioRequestedEvent) -> dict | None:
        return self.database["conversations"].find_one({"dataset_group_id":event.dataset_group_id,"conversation_id":event.conversation_id})

    def find_completed_fingerprint(self, fingerprint: str) -> dict | None:
        return self.metrics.find_one({"analysis_fingerprint":fingerprint,"status":{"$in":["completed","partial"]}},{"_id":0})

    def event_complete(self, event_id: str) -> bool:
        return self.jobs.find_one({"source_event_id":event_id,"status":{"$in":["completed","partial","failed","unavailable"]},"outcome_published_at":{"$exists":True}}) is not None

    def job(self, event_id: str) -> dict | None:
        return self.jobs.find_one({"source_event_id":event_id})

    def mark_processing(self, event: AudioRequestedEvent, fingerprint: str | None = None) -> None:
        now=datetime.now(timezone.utc)
        self.jobs.update_one({"source_event_id":event.event_id},{"$set":{"dataset_group_id":event.dataset_group_id,"conversation_id":event.conversation_id,"analysis_run_id":event.analysis_run_id,"analysis_fingerprint":fingerprint,"status":"processing","updated_at":now},"$setOnInsert":{"created_at":now}},upsert=True)
        self.database["conversation_metadata"].update_one({"dataset_group_id":event.dataset_group_id,"conversation_id":event.conversation_id},{"$set":{"audio_status":"processing","updated_at":now}})

    def save(self, result: AudioAnalysisResult, event: AudioRequestedEvent) -> str:
        document=result.model_dump(mode="python"); document["source_event_id"]=event.event_id
        stored=self.metrics.find_one_and_update({"analysis_run_id":result.analysis_run_id},{"$setOnInsert":document},upsert=True,return_document=ReturnDocument.AFTER)
        metrics_id=str(stored["_id"])
        now=datetime.now(timezone.utc)
        self.jobs.update_one({"source_event_id":event.event_id},{"$set":{"status":result.status,"audio_metrics_id":metrics_id,"analysis_run_id":result.analysis_run_id,"updated_at":now}},upsert=True)
        self.database["conversation_metadata"].update_one({"dataset_group_id":result.dataset_group_id,"conversation_id":result.conversation_id},{"$set":{"audio_status":result.status,"audio_analysis_run_id":result.analysis_run_id,"audio_features":result.recording_metrics,"updated_at":now}})
        return metrics_id

    def mark_published(self, event_id: str) -> None:
        self.jobs.update_one({"source_event_id":event_id},{"$set":{"outcome_published_at":datetime.now(timezone.utc)}})

    def fail(self, event: AudioRequestedEvent, code: str, message: str) -> None:
        now=datetime.now(timezone.utc)
        status="unavailable" if code in {"AUDIO_NOT_AVAILABLE","AUDIO_MODEL_UNAVAILABLE","AUDIO_URL_EXPIRED","AUDIO_ACCESS_DENIED"} else "failed"
        self.jobs.update_one({"source_event_id":event.event_id},{"$set":{"dataset_group_id":event.dataset_group_id,"conversation_id":event.conversation_id,"analysis_run_id":event.analysis_run_id,"status":status,"error_code":code,"error_message":message,"updated_at":now},"$setOnInsert":{"created_at":now}},upsert=True)
        self.database["conversation_metadata"].update_one({"dataset_group_id":event.dataset_group_id,"conversation_id":event.conversation_id},{"$set":{"audio_status":status,"audio_error_code":code,"updated_at":now}})

    def latest(self, dataset_group_id: str, conversation_id: str) -> dict | None:
        return self.metrics.find_one({"dataset_group_id":dataset_group_id,"conversation_id":conversation_id},{"_id":0},sort=[("processing_completed_at",-1)])
