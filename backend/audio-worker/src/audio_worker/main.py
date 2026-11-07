from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from threading import Thread
from fastapi import FastAPI, Response
from pymongo import MongoClient
from confluent_kafka.admin import AdminClient

from .config import Settings
from .consumer import AudioConsumer
from .diarization import DiarizationService, ModelLoader
from .repository import AudioRepository
from .services import AudioAnalysisService

logging.basicConfig(level=logging.INFO,format="%(asctime)s %(levelname)s %(name)s %(message)s")
settings=Settings.from_env(); settings.temp_dir.mkdir(parents=True,exist_ok=True)
mongo=MongoClient(settings.mongodb_uri,serverSelectionTimeoutMS=5000); repository=AudioRepository(mongo[settings.mongodb_database]); repository.ensure_indexes()
loader=ModelLoader(settings); service=AudioAnalysisService(settings,DiarizationService(loader),repository); consumer=AudioConsumer(settings,repository,service)
thread: Thread|None=None


@asynccontextmanager
async def lifespan(_:FastAPI):
    global thread
    if settings.enabled:
        thread=Thread(target=consumer.run,name="redpanda-audio-consumer",daemon=True); thread.start()
    yield
    consumer.stop()
    if thread: thread.join(timeout=15)
    mongo.close()


app=FastAPI(title="CQA Audio Worker",version=settings.analyzer_version,lifespan=lifespan)


@app.get("/health/live")
def live(): return {"status":"alive","enabled":settings.enabled}


@app.get("/health/ready")
def ready(response:Response):
    mongo_ok=kafka_ok=False
    try: mongo.admin.command("ping"); mongo_ok=True
    except Exception: pass
    try: AdminClient({"bootstrap.servers":settings.brokers}).list_topics(timeout=3); kafka_ok=True
    except Exception: pass
    process_ok=not settings.enabled or bool(consumer.ready and thread and thread.is_alive())
    healthy=mongo_ok and kafka_ok and process_ok
    if not healthy: response.status_code=503
    return {"status":"ready" if healthy else "not_ready","dependencies":{"mongodb":mongo_ok,"redpanda":kafka_ok},"worker_alive":process_ok,"inference":{"model_id":settings.model_id,"cache_available":loader.cache_available(),"loaded":loader.loaded,"ready":loader.loaded,"error":loader.error}}


@app.get("/health/model")
def model_status(): return {"model_id":settings.model_id,"revision":settings.model_revision,"device":settings.device,"cache_available":loader.cache_available(),"loaded":loader.loaded}
