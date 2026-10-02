from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    import hud

    return {"status": "ok", "hud": hud.__version__}
