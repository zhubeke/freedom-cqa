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
        self.database["audio_processing_history"].create_index([("dataset_group_id", 1), ("conversation_id", 1), ("occurred_at", -1)], name="audio_history_lookup")

    def conversation(self, event: AudioRequestedEvent) -> dict | None:
        return self.database["conversations"].find_one({"dataset_group_id": event.dataset_group_id, "conversation_id": event.conversation_id})

    def save(self, metrics: AudioMetrics, event_id: str) -> None:
        document = metrics.model_dump()
        document["source_event_id"] = event_id
        now = datetime.now(timezone.utc)
        previous = self.metrics.find_one({"dataset_group_id": metrics.dataset_group_id, "conversation_id": metrics.conversation_id, "processor_version": metrics.processor_version})
        if previous and previous.get("status") == "failed" and not self.database["audio_processing_history"].find_one({"dataset_group_id": metrics.dataset_group_id, "conversation_id": metrics.conversation_id, "source_event_id": previous.get("source_event_id"), "status": "failed"}):
            self.database["audio_processing_history"].insert_one({"dataset_group_id": metrics.dataset_group_id, "conversation_id": metrics.conversation_id, "processor_version": metrics.processor_version, "source_event_id": previous.get("source_event_id"), "status": "failed", "error": previous.get("error"), "occurred_at": previous.get("processed_at", now)})
        self.metrics.update_one(
            {"dataset_group_id": metrics.dataset_group_id, "conversation_id": metrics.conversation_id, "processor_version": metrics.processor_version},
            {"$set": document}, upsert=True,
        )
        self._set_metadata_status(metrics, "completed")
        self.database["audio_processing_history"].insert_one({"dataset_group_id": metrics.dataset_group_id, "conversation_id": metrics.conversation_id, "processor_version": metrics.processor_version, "source_event_id": event_id, "status": "completed", "occurred_at": now})

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
        self.database["audio_processing_history"].insert_one({"dataset_group_id": event.dataset_group_id, "conversation_id": event.conversation_id, "processor_version": event.processor_version, "source_event_id": event.event_id, "status": "failed", "error": message, "occurred_at": now})

    def _set_metadata_status(self, metrics: AudioMetrics, status: str) -> None:
        self.database["conversation_metadata"].update_one(
            {"dataset_group_id": metrics.dataset_group_id, "conversation_id": metrics.conversation_id},
            {"$set": {"audio_status": status, "updated_at": datetime.now(timezone.utc)}},
        )

