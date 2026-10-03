"""In-process event bus feeding the SSE endpoints.

Everything the runner observes (job lifecycle, each recorded step, grades) is published here as a
plain dict. Subscribers get their own queue; a slow consumer drops events rather than stalling the
runner.
"""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any

Event = dict[str, Any]

QUEUE_SIZE = 2000


def make_event(type_: str, *, job_id: str, run_id: str | None = None, data: Any = None) -> Event:
    return {
        "type": type_,
        "ts": datetime.now(UTC).isoformat(),
        "job_id": job_id,
        "run_id": run_id,
        "data": data,
    }


class EventBus:
    def __init__(self) -> None:
        self._subscribers: dict[int, tuple[str | None, asyncio.Queue[Event]]] = {}
        self._next_id = 0

    def publish(self, event: Event) -> None:
        for job_filter, queue in list(self._subscribers.values()):
            if job_filter is not None and job_filter != event.get("job_id"):
                continue
            with contextlib.suppress(asyncio.QueueFull):
                queue.put_nowait(event)

    @contextlib.asynccontextmanager
    async def subscribe(self, job_id: str | None = None) -> AsyncIterator[asyncio.Queue[Event]]:
        """Yield a queue receiving events for one job (or all jobs when job_id is None)."""
        sub_id = self._next_id
        self._next_id += 1
        queue: asyncio.Queue[Event] = asyncio.Queue(maxsize=QUEUE_SIZE)
        self._subscribers[sub_id] = (job_id, queue)
        try:
            yield queue
        finally:
            self._subscribers.pop(sub_id, None)

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)


bus = EventBus()
