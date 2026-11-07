FROM mwader/static-ffmpeg:7.1 AS ffmpeg
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_DISABLE_PIP_VERSION_CHECK=1 \
    OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 HF_HOME=/models/huggingface
COPY --from=ffmpeg /ffmpeg /usr/local/bin/ffmpeg
COPY --from=ffmpeg /ffprobe /usr/local/bin/ffprobe
RUN groupadd --system cqa && useradd --system --gid cqa --home /app cqa && mkdir -p /app /models/huggingface /var/tmp/cqa-audio && chown -R cqa:cqa /app /models /var/tmp/cqa-audio
WORKDIR /app
COPY requirements.txt pyproject.toml dependency-lockfile ./
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt
COPY --chown=cqa:cqa src ./src
COPY --chown=cqa:cqa tests ./tests
USER cqa
ENV PYTHONPATH=/app/src CQA_AUDIO_TEMP_DIR=/var/tmp/cqa-audio
EXPOSE 8080
STOPSIGNAL SIGTERM
CMD ["uvicorn", "audio_worker.main:app", "--host", "0.0.0.0", "--port", "8080", "--no-access-log"]
