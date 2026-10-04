from fastapi import APIRouter, HTTPException, Query, status
from sqlmodel import select

from db.engine import SessionDep
from db.models import Env, Job, Run
from services.analytics import job_analytics, task_signal

router = APIRouter(tags=["analytics"])


@router.get("/jobs/{job_id}/analytics")
def get_job_analytics(
    job_id: str, session: SessionDep, bins: int = Query(default=5, ge=1, le=50)
) -> dict:
    if session.get(Job, job_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    runs = list(session.exec(select(Run).where(Run.job_id == job_id)).all())
    return job_analytics(runs, bins=bins)


@router.get("/compare")
def compare(session: SessionDep, jobs: str = Query(description="Comma-separated job ids")) -> dict:
    """Per-task pass rates across jobs on the same environment."""
    ids = [j for j in jobs.split(",") if j]
    rows = [session.get(Job, j) for j in ids]
    if any(r is None for r in rows) or not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    found = [r for r in rows if r is not None]
    env_ids = {j.env_id for j in found}
    if len(env_ids) > 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Jobs must share an environment")
    env = session.get(Env, found[0].env_id)

    columns = []
    by_slug: dict[str, dict[str, dict]] = {}
    for job in found:
        runs = list(session.exec(select(Run).where(Run.job_id == job.id)).all())
        tasks = task_signal(runs)
        columns.append(
            {
                "job_id": job.id,
                "name": job.name,
                "model": job.model,
                "agent_type": job.agent_type,
                "status": job.status,
                "summary": job.summary,
                "created_at": job.created_at.isoformat(),
            }
        )
        for t in tasks:
            by_slug.setdefault(t["slug"], {})[job.id] = {
                "pass_rate": t["pass_rate"],
                "mean": t["mean"],
                "n": t["n"],
                "signal": t["signal"],
            }

    task_meta = {t["slug"]: t for t in (env.tasks if env else [])}
    return {
        "env": {"id": env.id, "name": env.name} if env else None,
        "columns": columns,
        "rows": [
            {
                "slug": slug,
                "task_id": task_meta.get(slug, {}).get("id", slug.rsplit("-", 1)[0]),
                "args": task_meta.get(slug, {}).get("args", {}),
                "cells": cells,
            }
            for slug, cells in sorted(by_slug.items())
        ],
    }
