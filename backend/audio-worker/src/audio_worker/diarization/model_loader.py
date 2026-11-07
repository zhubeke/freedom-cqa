from __future__ import annotations

import threading
from pathlib import Path
from audio_worker.config import Settings
from audio_worker.models import AudioErrorCode, AudioPipelineError


class ModelLoader:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._pipeline = None
        self._lock = threading.Lock()
        self.error: str | None = None

    def cache_available(self) -> bool:
        slug = f"models--{self.settings.model_id.replace('/', '--')}"
        root = Path(self.settings.model_cache_dir)
        return (root / "hub" / slug / "snapshots").exists() or (root / slug / "snapshots").exists()

    @property
    def loaded(self) -> bool: return self._pipeline is not None

    def load(self):
        if self._pipeline is not None: return self._pipeline
        with self._lock:
            if self._pipeline is not None: return self._pipeline
            if self.settings.device != "cpu": raise AudioPipelineError(AudioErrorCode.MODEL_UNAVAILABLE, "Only CPU inference is supported by this worker")
            try:
                import torch
                from pyannote.audio import Pipeline
                torch.set_num_threads(self.settings.torch_threads)
                kwargs = {"revision": self.settings.model_revision, "cache_dir": str(self.settings.model_cache_dir)}
                if self.settings.hf_token: kwargs["token"] = self.settings.hf_token
                self._pipeline = Pipeline.from_pretrained(self.settings.model_id, **kwargs)
                self._pipeline.to(torch.device("cpu"))
                self.error = None
                return self._pipeline
            except Exception as exc:
                self.error = type(exc).__name__
                raise AudioPipelineError(AudioErrorCode.MODEL_UNAVAILABLE, "Community-1 model is not cached, authorized, or loadable") from exc
