"""Aggregations over runs.

Pure functions: the runner stores the job summary, routes compute everything else on demand.
The training-signal section follows GRPO: for each task, a group of attempts is scored, and the
advantage of each attempt is its reward relative to the group. A task where every attempt gets
the same reward has zero advantage everywhere, which is to say nothing to learn from.
"""

from __future__ import annotations

import math
from collections import Counter
from typing import Any

from db.models import Run
from services.triage import CAUSES, Kind

DONE_STATUSES = {"completed", "error", "cancelled"}
ADVANTAGE_EPS = 1e-6


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


# -- training signal ---------------------------------------------------------------------------


def group_stats(rewards: list[float]) -> dict[str, Any]:
    n = len(rewards)
    if n == 0:
        return {
            "n": 0,
            "mean": None,
            "std": None,
            "variance": None,
            "pass_rate": None,
            "advantages": [],
            "signal": "unknown",
            "signal_strength": None,
        }
    mean = sum(rewards) / n
    variance = sum((r - mean) ** 2 for r in rewards) / n
    std = math.sqrt(variance)
    advantages = [(r - mean) / (std + ADVANTAGE_EPS) for r in rewards]
    passes = sum(1 for r in rewards if r >= 1)

    if variance > 0:
        signal = "learnable"
    elif passes == n:
        signal = "saturated"
    elif all(r <= 0 for r in rewards):
        signal = "impossible"
    else:
        signal = "flat"  # every attempt got the same partial credit

    return {
        "n": n,
        "mean": mean,
        "std": std,
        "variance": variance,
        "pass_rate": passes / n,
        "advantages": advantages,
        "signal": signal,
        "signal_strength": variance,  # 0.25 is the most a 0/1 reward can give
    }


def task_signal(runs: list[Run]) -> list[dict[str, Any]]:
    """Per task: group statistics over the attempts that count, plus every attempt's advantage."""
    groups: dict[str, list[Run]] = {}
    for run in runs:
        groups.setdefault(run.slug, []).append(run)

    out: list[dict[str, Any]] = []
    for slug, members in groups.items():
        members.sort(key=lambda r: r.attempt)
        counted = [r for r in members if counts_toward_reward(r)]
        stats = group_stats([float(r.reward) for r in counted])  # type: ignore[arg-type]
        advantage_by_id = {r.id: a for r, a in zip(counted, stats.pop("advantages"), strict=True)}
        out.append(
            {
                "slug": slug,
                "task_id": members[0].task_id,
                "args": members[0].args,
                "attempts_total": len(members),
                "excluded": len(members) - len(counted),
                **stats,
                "attempts": [
                    {
                        "run_id": r.id,
                        "attempt": r.attempt,
                        "status": r.status,
                        "reward": r.reward,
                        "cause": r.cause,
                        "cause_kind": r.cause_kind,
                        "excluded": r.excluded,
                        "counted": r.id in advantage_by_id,
                        "advantage": advantage_by_id.get(r.id),
                    }
                    for r in members
                ],
            }
        )

    order = {"learnable": 0, "flat": 1, "impossible": 2, "saturated": 3, "unknown": 4}
    out.sort(
        key=lambda t: (
            order.get(t["signal"], 9),
            -(t["signal_strength"] or 0),
            t["slug"],
        )
    )
    return out


def signal_summary(tasks: list[dict[str, Any]]) -> dict[str, Any]:
    counts = Counter(t["signal"] for t in tasks)
    with_data = [t for t in tasks if t["n"]]
    variances = [t["variance"] for t in with_data]
    return {
        "tasks": len(tasks),
        "learnable": counts.get("learnable", 0),
        "saturated": counts.get("saturated", 0),
        "impossible": counts.get("impossible", 0),
        "flat": counts.get("flat", 0),
        "unknown": counts.get("unknown", 0),
        "zero_gradient_fraction": (
            (len(with_data) - counts.get("learnable", 0)) / len(with_data) if with_data else None
        ),
        "mean_variance": _mean(variances),
        "max_group": max((t["n"] for t in tasks), default=0),
    }


def histogram(runs: list[Run], bins: int = 5, *, valid_only: bool = False) -> dict[str, Any]:
    """Reward distribution over graded runs, HUD-style (all runs) or valid-only."""
    bins = max(1, min(bins, 50))
    pool = [r for r in runs if r.reward is not None and (counts_toward_reward(r) or not valid_only)]
    counts = [0] * bins
    for r in pool:
        idx = min(int(r.reward * bins), bins - 1)  # type: ignore[operator]
        counts[idx] += 1
    return {
        "bins": [{"lo": i / bins, "hi": (i + 1) / bins, "count": counts[i]} for i in range(bins)],
        "n": len(pool),
        "valid_only": valid_only,
    }


def job_analytics(runs: list[Run], *, bins: int = 5) -> dict[str, Any]:
    tasks = task_signal(runs)
    return {
        "summary": summarize_job(runs),
        "histogram": histogram(runs, bins),
        "histogram_valid": histogram(runs, bins, valid_only=True),
        "signal": signal_summary(tasks),
        "tasks": tasks,
    }
