from fastapi import APIRouter, HTTPException, status
from sqlmodel import Session, select

from db.engine import SessionDep
from db.models import Env, Job, Run, Step
from schemas import JobOut, RunDetail, RunPatch
from services.analytics import summarize_job

router = APIRouter(tags=["runs"])


def _get(session: Session, run_id: str) -> Run:
    run = session.get(Run, run_id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
    return run


@router.get("/jobs/{job_id}/runs")
def list_runs(job_id: str, session: SessionDep) -> list[Run]:
    if session.get(Job, job_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    return list(
        session.exec(select(Run).where(Run.job_id == job_id).order_by(Run.slug, Run.attempt)).all()
    )


@router.get("/runs/{run_id}")
def get_run(run_id: str, session: SessionDep) -> RunDetail:
    run = _get(session, run_id)
    steps = list(session.exec(select(Step).where(Step.run_id == run.id).order_by(Step.seq)).all())
    job = session.get(Job, run.job_id)
    assert job is not None
    env = session.get(Env, job.env_id)
    runs = list(session.exec(select(Run).where(Run.job_id == job.id)).all())
    return RunDetail(
        run=run, steps=steps, job=JobOut.from_row(job, runs, env.name if env else None)
    )


@router.patch("/runs/{run_id}")
def patch_run(run_id: str, body: RunPatch, session: SessionDep) -> Run:
    """Exclude (or re-include) a run from aggregate scores, like invalidating a trace on hud.ai."""
    run = _get(session, run_id)
    run.excluded = body.excluded
    session.add(run)
    session.commit()

    job = session.get(Job, run.job_id)
    if job is not None and job.status not in ("queued", "running"):
        runs = list(session.exec(select(Run).where(Run.job_id == job.id)).all())
        job.summary = summarize_job(runs)
        session.add(job)
        session.commit()
    session.refresh(run)
    return run
