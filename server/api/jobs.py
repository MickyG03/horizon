import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Query, status
from sqlmodel import Session, select

from db.engine import SessionDep
from db.models import Env, Job, Run, Step
from schemas import JobCreate, JobDetail, JobOut
from services.runner import runner

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _get(session: Session, job_id: str) -> Job:
    job = session.get(Job, job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    return job


def _runs(session: Session, job_id: str) -> list[Run]:
    return list(
        session.exec(select(Run).where(Run.job_id == job_id).order_by(Run.slug, Run.attempt)).all()
    )


def _out(session: Session, job: Job) -> JobOut:
    env = session.get(Env, job.env_id)
    return JobOut.from_row(job, _runs(session, job.id), env.name if env else None)


def _create(session: Session, body: JobCreate) -> Job:
    env = session.get(Env, body.env_id)
    if env is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Environment not found")
    if body.task_ids:
        known = {t["slug"] for t in env.tasks}
        unknown = sorted(set(body.task_ids) - known)
        if unknown:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown task slugs: {unknown}")

    job = Job(
        id=uuid.uuid4().hex[:12],
        env_id=env.id,
        name=body.name or f"{env.taskset_name} · {body.model}",
        agent_type=body.agent_type,
        model=body.model,
        group_size=body.group_size,
        max_steps=body.max_steps,
        max_concurrent=body.max_concurrent,
        agent_config=body.agent_config,
        task_filter=body.task_ids,
    )
    session.add(job)
    session.commit()
    session.refresh(job)
    runner.start(job.id)  # needs the event loop: callers must be async handlers
    return job


@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def create_job(body: JobCreate, session: SessionDep) -> JobOut:
    return _out(session, _create(session, body))


@router.get("")
def list_jobs(
    session: SessionDep,
    status_: str | None = Query(default=None, alias="status"),
    env_id: str | None = None,
    limit: int = Query(default=50, ge=1, le=500),
) -> list[JobOut]:
    query = select(Job).order_by(Job.created_at.desc()).limit(limit)
    if status_:
        query = query.where(Job.status == status_)
    if env_id:
        query = query.where(Job.env_id == env_id)
    return [_out(session, job) for job in session.exec(query).all()]


@router.get("/{job_id}")
def get_job(job_id: str, session: SessionDep) -> JobDetail:
    job = _get(session, job_id)
    env = session.get(Env, job.env_id)
    runs = _runs(session, job.id)
    base = JobOut.from_row(job, runs, env.name if env else None)
    return JobDetail(**base.model_dump(), runs=runs)


@router.post("/{job_id}/cancel")
async def cancel_job(job_id: str, session: SessionDep) -> JobOut:
    job = _get(session, job_id)
    cancelled = await runner.cancel(job.id)
    if not cancelled and job.status in ("queued", "running"):
        # Not running in this process (e.g. server restarted mid-job): just mark it.
        job.status = "cancelled"
        job.finished_at = datetime.now(UTC)
        session.add(job)
        session.commit()
    session.expire_all()
    return _out(session, _get(session, job_id))


@router.post("/{job_id}/rerun", status_code=status.HTTP_202_ACCEPTED)
async def rerun_job(job_id: str, session: SessionDep) -> JobOut:
    job = _get(session, job_id)
    body = JobCreate(
        env_id=job.env_id,
        agent_type=job.agent_type,
        model=job.model,
        name=job.name,
        group_size=job.group_size,
        max_steps=job.max_steps,
        max_concurrent=job.max_concurrent,
        task_ids=job.task_filter,
        agent_config=job.agent_config,
    )
    return _out(session, _create(session, body))


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(job_id: str, session: SessionDep) -> None:
    job = _get(session, job_id)
    if runner.is_running(job.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "Cancel the job first")
    for run in _runs(session, job.id):
        for step in session.exec(select(Step).where(Step.run_id == run.id)).all():
            session.delete(step)
        session.delete(run)
    session.delete(job)
    session.commit()
