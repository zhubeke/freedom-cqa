# CQA audio worker

This Python 3.12 service consumes explicit `cqa.audio.requested.v1` jobs, securely resolves a configured audio source, creates a 16 kHz mono PCM processing copy, runs the local `pyannote/speaker-diarization-community-1` pipeline on CPU, aligns the supplied transcript at utterance level, computes acoustic metrics, versions the result in MongoDB, and publishes `cqa.audio.analyzed.v1`.

The service never performs ASR and never calls Cloudflare. Signed URLs and tokens are not logged or returned by the API.

## Model setup

Accept the Community-1 access conditions on Hugging Face and set `HF_TOKEN`. Model download is explicit:

```sh
make audio-build
make audio-model-check
make audio-model-warmup
make audio-up
make audio-health
```

The warmup stores weights in the persistent `cqa_audio_models` volume. Routine image builds and health checks do not download model weights.

## Tests

```sh
make audio-test
```

The real-model test is opt-in and requires both cached model weights and `CQA_REAL_AUDIO_FIXTURE`. Unit tests use synthetic signals and do not pretend to verify real diarization.

## Metrics and definitions

Recording speech is the union of all speaker intervals, so overlaps are not double counted. Silence is the complement of that union inside the decoded recording. Overlap is the union of intervals with at least two active acoustic speaker IDs. Interruption events are explicitly estimates supported by overlap, turn continuation, and transition evidence. Amplitude is reported as dBFS with a -120 dB floor; it is not calibrated SPL. Pitch values are descriptors, not emotion labels.
