from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from threading import Thread

from fastapi import FastAPI, Response
from pymongo import MongoClient

from .config import Settings
from .consumer import AudioConsumer
from .repository import AudioRepository

logging.basicConfig(level=logging.INFO)
settings = Settings.from_env()
mongo = MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=5000)
repository = AudioRepository(mongo[settings.mongodb_database])
repository.ensure_indexes()
consumer = AudioConsumer(settings, repository)
thread: Thread | None = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    global thread
    thread = Thread(target=consumer.run, name="redpanda-audio-consumer", daemon=True)
    thread.start()
    yield
    consumer.stop()
    thread.join(timeout=15)
    mongo.close()


app = FastAPI(lifespan=lifespan)


@app.get("/health/ready")
def ready(response: Response) -> dict:
    try:
        mongo.admin.command("ping")
        healthy = consumer.ready and thread is not None and thread.is_alive()
    except Exception:
        healthy = False
    if not healthy:
        response.status_code = 503
    return {"status": "ready" if healthy else "not_ready"}

