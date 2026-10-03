"""Aggregations over runs.

Pure functions: the runner stores the job summary, routes compute everything else on demand.
"""

from __future__ import annotations

from collections import Counter
from typing import Any

from db.models import Run
from services.triage import CAUSES, Kind

DONE_STATUSES = {"completed", "error", "cancelled"}


def counts_toward_reward(run: Run) -> bool:
    if run.excluded or run.reward is None:
        return False
    cause = CAUSES.get(run.cause or "")
    return cause is not None and cause.counts_toward_reward


def _mean(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def summarize_job(runs: list[Run]) -> dict[str, Any]:
    """Raw reward the way hud.ai computes it, next to the valid reward Horizon reports."""
    done = [r for r in runs if r.status in DONE_STATUSES]
    graded = [r.reward for r in done if r.reward is not None]
    valid = [r.reward for r in done if counts_toward_reward(r)]  # type: ignore[misc]

    by_cause = Counter(r.cause for r in done if r.cause)
    by_kind = Counter(r.cause_kind for r in done if r.cause_kind)

    prompt = sum(int(r.usage.get("prompt_tokens") or 0) for r in done)
    completion = sum(int(r.usage.get("completion_tokens") or 0) for r in done)

    durations = [
        (r.ended_at - r.started_at).total_seconds() for r in done if r.started_at and r.ended_at
    ]

    return {
        "n": len(runs),
        "done": len(done),
        "graded": len(graded),
        "valid_n": len(valid),
        "raw_reward": _mean(graded),
        "valid_reward": _mean(valid),
        "infra_failures": by_kind.get(Kind.INFRA.value, 0) + by_kind.get(Kind.ENV.value, 0),
        "by_cause": dict(by_cause),
        "by_kind": dict(by_kind),
        "tokens": {"prompt": prompt, "completion": completion, "total": prompt + completion},
        "duration_s": {
            "mean": _mean(durations),
            "max": max(durations) if durations else None,
            "total": sum(durations) if durations else None,
        },
    }
