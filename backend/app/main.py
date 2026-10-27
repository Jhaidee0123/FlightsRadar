import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import router
from app.config import get_settings
from app.db import get_db
from app.providers.base import ProviderThrottled
from app.services.watcher import radar_loop

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await asyncio.to_thread(get_db().migrate)
    task = asyncio.create_task(radar_loop())
    yield
    task.cancel()


app = FastAPI(title="FlightsRadar", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


@app.exception_handler(ProviderThrottled)
def throttled(_: Request, exc: ProviderThrottled):
    return JSONResponse(status_code=503, content={"detail": str(exc)}, headers={"Retry-After": "600"})


@app.get("/health")
def health():
    return {"ok": True}
