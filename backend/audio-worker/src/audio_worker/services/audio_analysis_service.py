from __future__ import annotations

import hashlib
import json
import tempfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import numpy as np

from audio_worker.config import Settings
from audio_worker.analyzer import analyze as analyze_mixed_audio
from audio_worker.diarization.diarization_service import DiarizationService
from audio_worker.diarization.speaker_mapper import apply_mapping, map_speakers
from audio_worker.diarization.transcript_alignment import align_transcript
from audio_worker.ingestion import normalize_audio, resolve_audio, validate_audio
from audio_worker.decoder import decode_raw_audio
from audio_worker.metrics.loudness_metrics import loudness
from audio_worker.metrics import calculate_metrics
from audio_worker.models import AudioAnalysisResult, AudioErrorCode, AudioPipelineError, AudioRequestedEvent


class AudioAnalysisService:
    def __init__(self, settings: Settings, diarization: DiarizationService, repository):
        self.settings = settings; self.diarization = diarization; self.repository = repository

    def _fingerprint(self, source_hash: str) -> str:
        raw = json.dumps({"source": source_hash, "model": self.settings.model_id, "revision": self.settings.model_revision, "schema": self.settings.schema_version, "analyzer": self.settings.analyzer_version, "min_overlap": self.settings.min_overlap_seconds}, sort_keys=True)
        return hashlib.sha256(raw.encode()).hexdigest()

    @staticmethod
    def _mixed_recording_metrics(samples: np.ndarray, sample_rate: int) -> dict[str, Any]:
        mixed = analyze_mixed_audio(samples, sample_rate)
        return {
            "recording_duration_seconds": mixed["duration_seconds"],
            "sample_rate_hz": sample_rate,
            "detected_speaker_count": None,
            "total_speech_seconds": mixed["speech_duration_seconds"],
            "total_silence_seconds": mixed["silence_duration_seconds"],
            "speech_ratio": mixed["speech_activity_ratio"],
            "silence_ratio": mixed["silence_ratio"],
            "total_overlap_seconds": None,
            "overlap_ratio": None,
            "longest_silence_seconds": mixed["longest_silence_seconds"],
            "speech_segment_count": mixed["speech_segment_count"],
            "interruption_count_estimate": None,
            "rms_dbfs": mixed["rms_dbfs"],
            "peak_dbfs": mixed["peak_dbfs"],
            "loudness_variability": mixed["loudness_variability"],
            "limitations": mixed["limitations"],
        }

    def analyze(self, event: AudioRequestedEvent) -> AudioAnalysisResult:
        conversation = self.repository.conversation(event)
        if not conversation: raise AudioPipelineError(AudioErrorCode.NOT_AVAILABLE, "Conversation does not exist")
        reference = event.audio_reference or conversation.get("audio_url")
        if not reference: raise AudioPipelineError(AudioErrorCode.NOT_AVAILABLE, "Conversation has no available audio")
        started = datetime.now(timezone.utc); timings: dict[str, float] = {}
        self.settings.temp_dir.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="job-", dir=self.settings.temp_dir) as folder:
            source, normalized, raw_decoded = Path(folder)/"source.media", Path(folder)/"canonical.wav", Path(folder)/"raw.wav"
            tick=time.perf_counter(); _, source_hash = resolve_audio(str(reference), source, self.settings); timings["download_duration_seconds"]=time.perf_counter()-tick
            fingerprint=self._fingerprint(source_hash)
            if not event.force_reanalysis:
                existing=self.repository.find_completed_fingerprint(fingerprint)
                if existing: return AudioAnalysisResult.model_validate(existing)
            self.repository.mark_processing(event, fingerprint)
            tick=time.perf_counter(); source_metadata=validate_audio(source, self.settings); raw_samples,raw_rate,raw_channels=decode_raw_audio(source,raw_decoded); samples, sample_rate=normalize_audio(source, normalized); timings["decode_duration_seconds"]=time.perf_counter()-tick
            duration=len(samples)/sample_rate
            tick=time.perf_counter()
            try:
                diarized, exclusive=self.diarization.analyze(normalized, duration)
            except AudioPipelineError as exc:
                if exc.code != AudioErrorCode.MODEL_UNAVAILABLE:
                    raise
                timings["diarization_duration_seconds"]=time.perf_counter()-tick
                recording=self._mixed_recording_metrics(raw_samples, raw_rate)
                return AudioAnalysisResult(
                    dataset_group_id=event.dataset_group_id, conversation_id=event.conversation_id,
                    analysis_run_id=event.analysis_run_id or str(uuid.uuid4()), status="partial",
                    schema_version=self.settings.schema_version, source_audio_hash=source_hash,
                    source_audio_reference="conversation.audio_url" if not event.audio_reference else "event.audio_reference",
                    analysis_fingerprint=fingerprint, model_id="mixed-audio-fallback", model_revision="1",
                    analyzer_version=self.settings.analyzer_version, processing_started_at=started,
                    processing_completed_at=datetime.now(timezone.utc),
                    audio_metadata={**source_metadata, "decoded_sample_rate_hz":raw_rate, "decoded_channel_count":raw_channels, "canonical_sample_rate_hz":sample_rate, "canonical_channel_count":1, "loudness_measurement_view":"raw_decoded_mono_mix_without_gain_normalization"},
                    recording_metrics=recording, speaker_metrics=[], role_summary={}, diarization_segments=[],
                    exclusive_diarization_segments=[], overlap_segments=[], interruption_events=[],
                    transcript_alignments=[], role_mapping={},
                    quality_indicators={"alignment_confidence":None, "alignment_coverage":0, "role_mapping_uncertain":True, "dBFS_is_uncalibrated":True, "diarization_available":False},
                    processing_statistics={**timings, "total_processing_duration_seconds":(datetime.now(timezone.utc)-started).total_seconds()},
                    errors=[{"code":exc.code.value, "message":"Speaker diarization model unavailable; mixed-audio metrics were calculated instead."}],
                )
            timings["diarization_duration_seconds"]=time.perf_counter()-tick
            tick=time.perf_counter(); recording, speakers, overlap, interruptions=calculate_metrics(samples, sample_rate, duration, diarized, self.settings.min_overlap_seconds); timings["metric_extraction_duration_seconds"]=time.perf_counter()-tick
            recording.update(loudness(np.mean(raw_samples,axis=1),raw_rate))
            alignments=align_transcript(conversation.get("transcript", []), exclusive, duration)
            mapping=map_speakers(alignments, self.settings.alignment_confidence_threshold)
            role_summary=apply_mapping(speakers, mapping)
            aligned=[x.alignment_confidence for x in alignments if x.alignment_status != "UNALIGNED"]
            recording["channel_count"]=source_metadata["original_channel_count"]
            result=AudioAnalysisResult(
                dataset_group_id=event.dataset_group_id, conversation_id=event.conversation_id,
                analysis_run_id=event.analysis_run_id or str(uuid.uuid4()), schema_version=self.settings.schema_version,
                source_audio_hash=source_hash, source_audio_reference="conversation.audio_url" if not event.audio_reference else "event.audio_reference",
                analysis_fingerprint=fingerprint, model_id=self.settings.model_id, model_revision=self.settings.model_revision,
                analyzer_version=self.settings.analyzer_version, processing_started_at=started, processing_completed_at=datetime.now(timezone.utc),
                audio_metadata={**source_metadata, "decoded_sample_rate_hz":raw_rate, "decoded_channel_count":raw_channels, "canonical_sample_rate_hz":sample_rate, "canonical_channel_count":1, "loudness_measurement_view":"raw_decoded_mono_mix_without_gain_normalization"},
                recording_metrics=recording, speaker_metrics=speakers, role_summary=role_summary, diarization_segments=diarized,
                exclusive_diarization_segments=exclusive, overlap_segments=overlap, interruption_events=interruptions,
                transcript_alignments=alignments, role_mapping=mapping,
                quality_indicators={"alignment_confidence": float(np.mean(aligned)) if aligned else None, "alignment_coverage": len(aligned)/len(alignments) if alignments else 0, "role_mapping_uncertain": any(x["inferred_role"]=="unknown" for x in mapping.values()), "dBFS_is_uncalibrated": True},
                processing_statistics={**timings, "total_processing_duration_seconds":(datetime.now(timezone.utc)-started).total_seconds()}
            )
            return result
