FROM mwader/static-ffmpeg:7.1 AS ffmpeg
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY --from=ffmpeg /ffmpeg /usr/local/bin/ffmpeg
COPY --from=ffmpeg /ffprobe /usr/local/bin/ffprobe
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY src ./src
ENV PYTHONPATH=/app/src
EXPOSE 8080
CMD ["uvicorn", "audio_worker.main:app", "--host", "0.0.0.0", "--port", "8080"]

