"""The environment builder: templates, the machine's readiness, and builds."""

from fastapi import APIRouter, HTTPException, status
from sqlmodel import Session, select

from db.engine import SessionDep
from db.models import EnvBuild
from schemas import BuildCreate, BuildRetry
from services.builder import BuildError, builder, catalog, check_name, machine

router = APIRouter(prefix="/builder", tags=["builder"])


def _get(session: Session, build_id: str) -> EnvBuild:
    build = session.get(EnvBuild, build_id)
    if build is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Build not found")
    return build


@router.get("/templates")
def list_templates() -> list[dict]:
    return catalog()


@router.get("/machine")
async def get_machine() -> dict:
    return await machine()


@router.get("/names/{name}")
def name_available(name: str) -> dict:
    problem = check_name(name)
    return {"name": name, "available": problem is None, "problem": problem}


@router.get("/builds")
def list_builds(session: SessionDep, limit: int = 20) -> list[dict]:
    rows = session.exec(select(EnvBuild).order_by(EnvBuild.created_at.desc()).limit(limit)).all()
    return [builder.view(b) for b in rows]


@router.post("/builds", status_code=status.HTTP_201_CREATED)
async def create_build(body: BuildCreate, session: SessionDep) -> dict:
    try:
        build = builder.start(
            session,
            template_id=body.template,
            name=body.name,
            secrets=body.secrets,
            install=body.install,
            build_image=body.build_image,
        )
    except BuildError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from None
    return builder.view(build)


@router.get("/builds/{build_id}")
def get_build(build_id: str, session: SessionDep) -> dict:
    return builder.view(_get(session, build_id))


@router.post("/builds/{build_id}/retry")
async def retry_build(build_id: str, body: BuildRetry, session: SessionDep) -> dict:
    build = _get(session, build_id)
    if all(s["status"] == "done" for s in build.steps):
        raise HTTPException(status.HTTP_409_CONFLICT, "Nothing to retry")
    try:
        return builder.view(
            builder.retry(session, build, install=body.install, build_image=body.build_image)
        )
    except BuildError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from None
