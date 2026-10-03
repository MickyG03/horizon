"""Server-sent events. One stream per job (with replay) or one for everything."""

import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, HTTPException, Request, status
from sqlmodel import Session, select
from sse_starlette.sse import EventSourceResponse

from db.engine import engine
from db.models import Job, Run, Step
from services.events import Event, bus, make_event

router = APIRouter(tags=["events"])

KEEPALIVE_S = 15


def _sse(event: Event) -> dict[str, str]:
    return {"event": event["type"], "data": json.dumps(event)}


def _snapshot(job_id: str) -> list[Event]:
    """Everything persisted so far for a job, as the events a live client would have seen."""
    with Session(engine) as session:
        job = session.get(Job, job_id)
        if job is None:
            return []
        events = [make_event("job.snapshot", job_id=job_id, data=job.model_dump(mode="json"))]
        runs = session.exec(select(Run).where(Run.job_id == job_id)).all()
        for run in runs:
            events.append(
                make_event(
                    "run.snapshot", job_id=job_id, run_id=run.id, data=run.model_dump(mode="json")
                )
            )
            steps = session.exec(select(Step).where(Step.run_id == run.id).order_by(Step.seq)).all()
            for step in steps:
                events.append(
                    make_event(
                        "step", job_id=job_id, run_id=run.id, data={"seq": step.seq, **step.payload}
                    )
                )
        return events


async def _stream(request: Request, job_id: str | None, replay: bool) -> AsyncIterator[dict]:
    async with bus.subscribe(job_id) as queue:
        if job_id and replay:
            for event in _snapshot(job_id):
                yield _sse(event)
        while True:
            if await request.is_disconnected():
                return
            try:
                event = await asyncio.wait_for(queue.get(), timeout=KEEPALIVE_S)
            except TimeoutError:
                yield {"comment": "keepalive"}
                continue
            yield _sse(event)


@router.get("/events")
async def all_events(request: Request) -> EventSourceResponse:
    return EventSourceResponse(_stream(request, None, replay=False))


@router.get("/jobs/{job_id}/events")
async def job_events(request: Request, job_id: str, replay: bool = True) -> EventSourceResponse:
    with Session(engine) as session:
        if session.get(Job, job_id) is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    return EventSourceResponse(_stream(request, job_id, replay))
