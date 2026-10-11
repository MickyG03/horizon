"""How long each builder step usually takes, from past builds of the same template.

The build page compares a running step against this to tell a slow step from a stuck one.
Only steps that ran to `done` count: skipped steps are instant and would drag the typical down.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from statistics import median

from sqlmodel import Session, select

from db.models import EnvBuild

HISTORY = 20  # most recent builds of the template to learn from


def step_seconds(step: dict) -> float | None:
    """How long a finished step took, or None if it wasn't timed."""
    started, ended = step.get("started_at"), step.get("ended_at")
    if not started or not ended:
        return None
    return (datetime.fromisoformat(ended) - datetime.fromisoformat(started)).total_seconds()


def typical_seconds(
    session: Session, template: str, exclude: str | None = None
) -> dict[str, float]:
    """Median duration per step key over recent builds of `template` (leaving out `exclude`,
    the build being looked at). Keys with no history are absent."""
    rows = session.exec(
        select(EnvBuild)
        .where(EnvBuild.template == template)
        .order_by(EnvBuild.created_at.desc())
        .limit(HISTORY + 1)
    ).all()
    samples: dict[str, list[float]] = defaultdict(list)
    for build in rows:
        if build.id == exclude:
            continue
        for step in build.steps:
            seconds = step_seconds(step) if step["status"] == "done" else None
            if seconds is not None:
                samples[step["key"]].append(seconds)
    return {key: round(median(values), 1) for key, values in samples.items()}
