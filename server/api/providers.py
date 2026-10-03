from fastapi import APIRouter

from services.providers import list_providers

router = APIRouter(tags=["providers"])


@router.get("/providers")
def providers() -> list[dict]:
    return list_providers()
