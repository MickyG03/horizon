"""Grader health probes.

A grader that rewards junk will teach a model to produce junk. Each probe feeds a task a canned
answer through the real grading path (a ScriptedAgent driven by `rollout`, no LLM involved). A
healthy grader rejects every probe; any probe it accepts is a reward-hacking risk, reported with
the exact string that got through.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any

from sqlmodel import Session, select

from db.models import Env, ProbeResult
from services.agents import ScriptedAgent, ScriptedConfig
from services.runner import _load_taskset, _placement

LOREM = (
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt "
    "ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation. "
) * 12

PROBES: list[tuple[str, str, str]] = [
    ("empty", "", "An empty reply"),
    ("dont_know", "I don't know.", "A refusal"),
    ("echo_prompt", ScriptedAgent.ECHO_PROMPT, "The prompt repeated back verbatim"),
    ("all_digits", "0 1 2 3 4 5 6 7 8 9", "Every digit at once (catches substring checks)"),
    ("yes", "yes", "A bare yes"),
    ("true", "true", "A bare true"),
    ("done", "Done.", "Claims completion without doing anything"),
    ("lorem", LOREM, "Two kilobytes of filler"),
    (
        "json_blob",
        '{"answer": null, "status": "ok", "score": 1.0}',
        "A JSON object claiming success",
    ),
    ("hedge", "The answer is one of: 1, 2, 3, 4, 5.", "Hedging across several answers"),
]

DEFAULT_CONCURRENCY = 6


async def _probe_one(task: Any, probe_answer: str, place: Any, sem: asyncio.Semaphore):
    from hud.eval.run import rollout

    agent = ScriptedAgent(ScriptedConfig(answer=probe_answer))
    async with sem:
        return await rollout(task, agent, runtime=place)


async def run_probes(
    session: Session,
    env: Env,
    *,
    slugs: list[str] | None = None,
    max_concurrent: int = DEFAULT_CONCURRENCY,
) -> list[ProbeResult]:
    taskset = await _load_taskset(env, slugs)
    place = _placement(env)
    sem = asyncio.Semaphore(max(1, max_concurrent))

    jobs = [
        (slug, task, name, answer) for slug, task in taskset.items() for name, answer, _ in PROBES
    ]
    outcomes = await asyncio.gather(
        *(_probe_one(task, answer, place, sem) for _, task, _, answer in jobs),
        return_exceptions=True,
    )

    # Replace this env's previous results (for the probed tasks) wholesale.
    probed = {slug for slug, *_ in jobs}
    for old in session.exec(select(ProbeResult).where(ProbeResult.env_id == env.id)).all():
        if old.slug in probed:
            session.delete(old)

    results: list[ProbeResult] = []
    now = datetime.now(UTC)
    for (slug, task, name, answer), outcome in zip(jobs, outcomes, strict=True):
        if isinstance(outcome, BaseException):
            row = ProbeResult(
                env_id=env.id,
                task_id=task.id,
                slug=slug,
                probe=name,
                answer=answer,
                reward=None,
                accepted=False,
                error=f"{type(outcome).__name__}: {outcome}",
                ran_at=now,
            )
        else:
            grade = getattr(outcome, "grade", None)
            reward = getattr(grade, "reward", None) if grade is not None else None
            error = outcome.trace.error
            row = ProbeResult(
                env_id=env.id,
                task_id=task.id,
                slug=slug,
                probe=name,
                answer=answer,
                reward=float(reward) if reward is not None else None,
                accepted=reward is not None and reward > 0,
                error=error,
                ran_at=now,
            )
        session.add(row)
        results.append(row)

    session.commit()
    all_rows = session.exec(select(ProbeResult).where(ProbeResult.env_id == env.id)).all()
    env.probe_score = health_score(list(all_rows))
    session.add(env)
    session.commit()
    for row in results:
        session.refresh(row)
    return results


def health_score(rows: list[ProbeResult]) -> float | None:
    """Fraction of probes the graders correctly rejected (errors don't count either way)."""
    judged = [r for r in rows if r.error is None]
    if not judged:
        return None
    return 1 - sum(1 for r in judged if r.accepted) / len(judged)


def report(rows: list[ProbeResult]) -> dict[str, Any]:
    by_task: dict[str, list[ProbeResult]] = {}
    for r in rows:
        by_task.setdefault(r.slug, []).append(r)
    descriptions = {name: desc for name, _, desc in PROBES}
    tasks = []
    for slug, task_rows in by_task.items():
        accepted = [r for r in task_rows if r.accepted]
        tasks.append(
            {
                "slug": slug,
                "task_id": task_rows[0].task_id,
                "score": health_score(task_rows),
                "accepted": [
                    {
                        "probe": r.probe,
                        "answer": r.answer,
                        "reward": r.reward,
                        "description": descriptions.get(r.probe, ""),
                    }
                    for r in accepted
                ],
                "errors": [{"probe": r.probe, "error": r.error} for r in task_rows if r.error],
                "probes": [
                    {
                        "probe": r.probe,
                        "reward": r.reward,
                        "accepted": r.accepted,
                        "error": r.error,
                        "description": descriptions.get(r.probe, ""),
                    }
                    for r in task_rows
                ],
                "ran_at": max(r.ran_at for r in task_rows).isoformat(),
            }
        )
    tasks.sort(key=lambda t: (t["score"] if t["score"] is not None else 2, t["slug"]))
    return {
        "score": health_score(rows),
        "probe_count": len(PROBES),
        "catalogue": [{"probe": n, "description": d} for n, _, d in PROBES],
        "tasks": tasks,
    }
