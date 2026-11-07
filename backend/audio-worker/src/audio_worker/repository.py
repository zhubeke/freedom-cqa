from __future__ import annotations

from datetime import datetime, timezone

from pymongo.database import Database

from .models import AudioMetrics, AudioRequestedEvent


class AudioRepository:
    def __init__(self, database: Database):
        self.database = database
        self.metrics = database["audio_metrics"]

    def ensure_indexes(self) -> None:
        self.metrics.create_index([("dataset_group_id", 1), ("conversation_id", 1), ("processor_version", 1)], unique=True, name="audio_metrics_version_unique")

    def conversation(self, event: AudioRequestedEvent) -> dict | None:
        return self.database["conversations"].find_one({"dataset_group_id": event.dataset_group_id, "conversation_id": event.conversation_id})

    def save(self, metrics: AudioMetrics, event_id: str) -> None:
        document = metrics.model_dump()
        document["source_event_id"] = event_id
        self.metrics.update_one(
            {"dataset_group_id": metrics.dataset_group_id, "conversation_id": metrics.conversation_id, "processor_version": metrics.processor_version},
            {"$set": document}, upsert=True,
        )
        self._set_metadata_status(metrics, "completed")

    def fail(self, event: AudioRequestedEvent, message: str) -> None:
        now = datetime.now(timezone.utc)
        self.metrics.update_one(
            {"dataset_group_id": event.dataset_group_id, "conversation_id": event.conversation_id, "processor_version": event.processor_version},
            {"$set": {"status": "failed", "error": message, "processed_at": now, "source_event_id": event.event_id}}, upsert=True,
        )
        self.database["conversation_metadata"].update_one(
            {"dataset_group_id": event.dataset_group_id, "conversation_id": event.conversation_id},
            {"$set": {"audio_status": "failed", "updated_at": now}, "$push": {"errors": {"stage": "audio", "message": message, "occurred_at": now}}},
        )

    def _set_metadata_status(self, metrics: AudioMetrics, status: str) -> None:
        self.database["conversation_metadata"].update_one(
            {"dataset_group_id": metrics.dataset_group_id, "conversation_id": metrics.conversation_id},
            {"$set": {"audio_status": status, "updated_at": datetime.now(timezone.utc)}},
        )

