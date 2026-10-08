"""Horizon API entry point. Run from this directory: `uv run uvicorn main:app --reload`."""

# ruff: noqa: E402  -- the hud SDK reads its settings once at import time, so the telemetry
# switch below has to be set before anything that imports `hud` is loaded.
import os

from config import settings

os.environ["HUD_TELEMETRY_ENABLED"] = "true" if settings.telemetry_sync else "false"

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import analytics, builder, envs, events, health, jobs, keys, probes, providers, runs
from db.engine import init_db
from services.builder import builder as env_builder
from services.runner import runner

VERSION = "0.1.0"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("hud.agents").setLevel(logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    env_builder.recover()
    yield
    await runner.shutdown()
    await env_builder.shutdown()


def create_app() -> FastAPI:
    app = FastAPI(title="Horizon", version=VERSION, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    for router in (health, providers, keys, envs, builder, jobs, runs, events, analytics, probes):
        app.include_router(router.router, prefix="/api")
    return app


app = create_app()
