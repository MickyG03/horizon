"""Horizon API entry point. Run from this directory: `uv run uvicorn main:app --reload`."""

# ruff: noqa: E402  -- the hud SDK reads its settings once at import time, so the telemetry
# switch below has to be set before anything that imports `hud` is loaded.
import os

from config import settings

os.environ["HUD_TELEMETRY_ENABLED"] = "true" if settings.telemetry_sync else "false"

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import health
from db.engine import init_db

VERSION = "0.1.0"


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Horizon", version=VERSION, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router, prefix="/api")
    return app


app = create_app()
