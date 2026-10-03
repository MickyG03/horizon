from fastapi import APIRouter, HTTPException, status
from sqlmodel import Session, select

from db.engine import SessionDep
from db.models import Env, Job
from schemas import EnvCreate
from services import envs
from services.runner import runner

router = APIRouter(prefix="/envs", tags=["envs"])


def _get(session: Session, env_id: str) -> Env:
    env = envs.get_env(session, env_id)
    if env is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Environment not found")
    return env


@router.get("")
def list_envs(session: SessionDep) -> list[Env]:
    return envs.list_envs(session)


@router.post("", status_code=status.HTTP_201_CREATED)
async def register_env(body: EnvCreate, session: SessionDep) -> Env:
    try:
        return await envs.register(session, body.path)
    except envs.EnvError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from None


@router.get("/{env_id}")
def get_env(env_id: str, session: SessionDep) -> Env:
    return _get(session, env_id)


@router.get("/{env_id}/tasks")
def list_tasks(env_id: str, session: SessionDep) -> list[dict]:
    return _get(session, env_id).tasks


@router.post("/{env_id}/reload")
async def reload_env(env_id: str, session: SessionDep) -> Env:
    env = _get(session, env_id)
    try:
        return await envs.reload(session, env)
    except envs.EnvError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from None


@router.delete("/{env_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_env(env_id: str, session: SessionDep) -> None:
    env = _get(session, env_id)
    jobs = session.exec(select(Job).where(Job.env_id == env.id)).all()
    if any(runner.is_running(job.id) for job in jobs):
        raise HTTPException(status.HTTP_409_CONFLICT, "Cancel running jobs first")
    envs.delete_env(session, env)
