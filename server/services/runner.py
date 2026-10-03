"""Job runner.

A job is `tasks x group_size` rollouts. Horizon drives each rollout itself (the same
`hud.eval.run.rollout` the SDK's `Taskset.run` uses) so that one failure or cancel never takes the
whole batch down, and results are persisted the moment each run is graded.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlmodel import Session, select

from db.engine import engine
from db.models import Env, Job, Run, Step
from services.agents import build_agent
from services.analytics import summarize_job
from services.events import bus, make_event
from services.triage import classify

log = logging.getLogger("horizon.runner")

RUN_DONE = {"completed", "error", "cancelled"}


def utcnow() -> datetime:
    return datetime.now(UTC)


class StepRecorder:
    """Persists and publishes steps as the streaming agent hands them over."""

    def __init__(self, job_id: str) -> None:
        self.job_id = job_id
        self._seq: dict[str, int] = {}

    def __call__(self, trace_id: str, step: Any) -> None:
        seq = self._seq.get(trace_id, 0)
        self._seq[trace_id] = seq + 1
        payload = step.model_dump(mode="json", exclude_none=True)

        with Session(engine) as session:
            session.add(
                Step(
                    run_id=trace_id,
                    seq=seq,
                    source=str(step.source),
                    payload=payload,
                    started_at=step.started_at,
                    ended_at=step.ended_at,
                )
            )
            session.commit()

        bus.publish(
            make_event("step", job_id=self.job_id, run_id=trace_id, data={"seq": seq, **payload})
        )


def _placement(source: Path):
    from hud.eval import DockerRuntime, SubprocessRuntime

    local = SubprocessRuntime(source)
    docker: Any = None

    def place(task: Any):
        nonlocal docker
        cfg = task.runtime_config
        if cfg is not None and (getattr(cfg, "image", None) or getattr(cfg, "compose", None)):
            docker = docker or DockerRuntime()
            return docker(task)
        return local(task)

    return place


def _load_taskset(source: Path, slugs: list[str] | None):
    from hud.eval import Taskset

    taskset = Taskset.from_file(source)
    if slugs:
        taskset = taskset.filter(slugs)
    return taskset


def _usage_of(trace: Any) -> dict[str, int]:
    prompt = completion = cached = calls = 0
    for step in trace.steps:
        usage = getattr(step, "usage", None)
        if usage is None:
            continue
        calls += 1
        prompt += int(getattr(usage, "prompt_tokens", 0) or 0)
        completion += int(getattr(usage, "completion_tokens", 0) or 0)
        cached += int(getattr(usage, "cached_tokens", 0) or 0)
    return {
        "prompt_tokens": prompt,
        "completion_tokens": completion,
        "cached_tokens": cached,
        "llm_calls": calls,
    }


def _run_public(run: Run) -> dict[str, Any]:
    return run.model_dump(mode="json")


class JobRunner:
    def __init__(self) -> None:
        self._tasks: dict[str, asyncio.Task[None]] = {}

    # -- lifecycle -------------------------------------------------------------------------

    def start(self, job_id: str) -> None:
        task = asyncio.create_task(self._run_job(job_id), name=f"job:{job_id}")
        self._tasks[job_id] = task
        task.add_done_callback(lambda _t: self._tasks.pop(job_id, None))

    def is_running(self, job_id: str) -> bool:
        return job_id in self._tasks

    async def cancel(self, job_id: str) -> bool:
        task = self._tasks.get(job_id)
        if task is None:
            return False
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        return True

    async def shutdown(self) -> None:
        for job_id in list(self._tasks):
            await self.cancel(job_id)

    # -- the job ---------------------------------------------------------------------------

    async def _run_job(self, job_id: str) -> None:
        with Session(engine) as session:
            job = session.get(Job, job_id)
            if job is None:
                return
            env = session.get(Env, job.env_id)
            if env is None:
                self._fail(session, job, "Environment no longer exists.")
                return
            job.status = "running"
            job.started_at = utcnow()
            session.add(job)
            session.commit()
            session.refresh(job)
            source = Path(env.path)
            job_public = job.model_dump(mode="json")

        bus.publish(make_event("job.started", job_id=job_id, data=job_public))

        try:
            taskset = await asyncio.to_thread(_load_taskset, source, job.task_filter)
            recorder = StepRecorder(job_id)
            agent = build_agent(
                agent_type=job.agent_type,
                model=job.model,
                max_steps=job.max_steps,
                agent_config=job.agent_config,
                sink=recorder,
            )
            place = _placement(source)
            semaphore = asyncio.Semaphore(max(1, job.max_concurrent))

            plan: list[tuple[str, Any, str, int]] = []  # (run_id, task, group_id, attempt)
            with Session(engine) as session:
                for slug, task in taskset.items():
                    group_id = uuid.uuid4().hex[:12]
                    for attempt in range(max(1, job.group_size)):
                        run_id = uuid.uuid4().hex
                        session.add(
                            Run(
                                id=run_id,
                                job_id=job_id,
                                task_id=task.id,
                                slug=slug,
                                args=dict(task.args or {}),
                                group_id=group_id,
                                attempt=attempt,
                                status="pending",
                            )
                        )
                        plan.append((run_id, task, group_id, attempt))
                session.commit()

            bus.publish(
                make_event("job.progress", job_id=job_id, data={"total": len(plan), "done": 0})
            )

            await asyncio.gather(
                *(
                    self._rollout(job, run_id, task, agent, place, semaphore, group_id)
                    for run_id, task, group_id, _ in plan
                ),
                return_exceptions=True,
            )

            with Session(engine) as session:
                job = session.get(Job, job_id)
                assert job is not None
                self._finish(session, job, "finished")

        except asyncio.CancelledError:
            with Session(engine) as session:
                job = session.get(Job, job_id)
                if job is not None:
                    self._cancel_remaining(session, job)
                    self._finish(session, job, "cancelled")
            raise
        except Exception as exc:
            log.exception("job %s failed", job_id)
            with Session(engine) as session:
                job = session.get(Job, job_id)
                if job is not None:
                    self._cancel_remaining(session, job)
                    self._fail(session, job, f"{type(exc).__name__}: {exc}")

    async def _rollout(
        self,
        job: Job,
        run_id: str,
        task: Any,
        agent: Any,
        place: Any,
        semaphore: asyncio.Semaphore,
        group_id: str,
    ) -> None:
        from hud.eval.run import rollout

        async with semaphore:
            self._update_run(run_id, status="running", started_at=utcnow())
            bus.publish(make_event("run.started", job_id=job.id, run_id=run_id))

            try:
                result = await rollout(
                    task,
                    agent,
                    runtime=place,
                    job_id=job.id,
                    group_id=group_id,
                    trace_id=run_id,
                )
            except asyncio.CancelledError:
                self._update_run(run_id, status="cancelled", ended_at=utcnow())
                self._classify(run_id)
                bus.publish(make_event("run.cancelled", job_id=job.id, run_id=run_id))
                raise
            except Exception as exc:
                log.exception("rollout %s crashed", run_id)
                self._update_run(
                    run_id,
                    status="error",
                    error=f"{type(exc).__name__}: {exc}",
                    ended_at=utcnow(),
                )
                self._classify(run_id)
                self._publish_run(job.id, run_id, "run.failed")
                return

            self._persist_result(run_id, result)
            self._publish_run(job.id, run_id, "run.graded")
            self._publish_progress(job.id)

    # -- persistence helpers ---------------------------------------------------------------

    def _persist_result(self, run_id: str, result: Any) -> None:
        trace = result.trace
        grade = getattr(result, "grade", None)
        reward = getattr(grade, "reward", None) if grade is not None else None
        status = trace.status or "completed"

        with Session(engine) as session:
            run = session.get(Run, run_id)
            if run is None:
                return
            run.status = status
            run.reward = float(reward) if reward is not None else None
            run.answer = trace.content
            run.stop_reason = trace.stop_reason
            run.error = trace.error
            run.usage = _usage_of(trace)
            run.ended_at = utcnow()
            if getattr(result, "slug", None):
                run.slug = result.slug
            cause = classify(
                error=run.error,
                stop_reason=run.stop_reason,
                reward=run.reward,
                answer=run.answer,
                status=run.status,
            )
            run.cause = cause.id
            run.cause_kind = cause.kind.value
            session.add(run)
            session.commit()

    def _update_run(self, run_id: str, **fields: Any) -> None:
        with Session(engine) as session:
            run = session.get(Run, run_id)
            if run is None:
                return
            for key, value in fields.items():
                setattr(run, key, value)
            session.add(run)
            session.commit()

    def _classify(self, run_id: str) -> None:
        with Session(engine) as session:
            run = session.get(Run, run_id)
            if run is None:
                return
            cause = classify(
                error=run.error,
                stop_reason=run.stop_reason,
                reward=run.reward,
                answer=run.answer,
                status=run.status,
            )
            run.cause = cause.id
            run.cause_kind = cause.kind.value
            session.add(run)
            session.commit()

    def _publish_run(self, job_id: str, run_id: str, type_: str) -> None:
        with Session(engine) as session:
            run = session.get(Run, run_id)
            if run is not None:
                bus.publish(make_event(type_, job_id=job_id, run_id=run_id, data=_run_public(run)))

    def _publish_progress(self, job_id: str) -> None:
        with Session(engine) as session:
            runs = session.exec(select(Run).where(Run.job_id == job_id)).all()
        done = sum(1 for r in runs if r.status in RUN_DONE)
        bus.publish(
            make_event(
                "job.progress",
                job_id=job_id,
                data={"total": len(runs), "done": done, "summary": summarize_job(list(runs))},
            )
        )

    def _cancel_remaining(self, session: Session, job: Job) -> None:
        runs = session.exec(select(Run).where(Run.job_id == job.id)).all()
        for run in runs:
            if run.status not in RUN_DONE:
                run.status = "cancelled"
                run.ended_at = utcnow()
                run.cause = "cancelled"
                run.cause_kind = "infra"
                session.add(run)
        session.commit()

    def _finish(self, session: Session, job: Job, status: str) -> None:
        runs = list(session.exec(select(Run).where(Run.job_id == job.id)).all())
        job.status = status
        job.finished_at = utcnow()
        job.summary = summarize_job(runs)
        session.add(job)
        session.commit()
        session.refresh(job)
        bus.publish(make_event(f"job.{status}", job_id=job.id, data=job.model_dump(mode="json")))

    def _fail(self, session: Session, job: Job, error: str) -> None:
        job.error = error
        self._finish(session, job, "failed")


runner = JobRunner()
