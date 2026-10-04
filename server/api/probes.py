from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlmodel import select

from db.engine import SessionDep
from db.models import Env, ProbeResult
from services import probes

router = APIRouter(prefix="/envs", tags=["probes"])


class ProbeRequest(BaseModel):
    task_ids: list[str] | None = None
    max_concurrent: int = probes.DEFAULT_CONCURRENCY


def _env(session, env_id: str) -> Env:
    env = session.get(Env, env_id)
    if env is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Environment not found")
    return env


@router.get("/{env_id}/probes")
def get_probes(env_id: str, session: SessionDep) -> dict:
    env = _env(session, env_id)
    rows = list(session.exec(select(ProbeResult).where(ProbeResult.env_id == env.id)).all())
    return probes.report(rows)


@router.post("/{env_id}/probes")
async def run_probes(env_id: str, session: SessionDep, body: ProbeRequest | None = None) -> dict:
    env = _env(session, env_id)
    body = body or ProbeRequest()
    try:
        await probes.run_probes(
            session, env, slugs=body.task_ids, max_concurrent=body.max_concurrent
        )
    except Exception as exc:  # loading the tasks file can fail in many ways
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{type(exc).__name__}: {exc}") from None
    rows = list(session.exec(select(ProbeResult).where(ProbeResult.env_id == env.id)).all())
    return probes.report(rows)
