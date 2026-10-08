from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from services import keys

router = APIRouter(prefix="/settings/keys", tags=["settings"])


class KeyBody(BaseModel):
    value: str = Field(min_length=1, max_length=512)


@router.get("")
def list_keys() -> list[dict]:
    return keys.status()


@router.put("/{provider}")
def save_key(provider: str, body: KeyBody) -> dict:
    try:
        return keys.set_key(provider, body.value)
    except keys.KeyError_ as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from None


@router.delete("/{provider}")
def remove_key(provider: str) -> dict:
    try:
        return keys.clear_key(provider)
    except keys.KeyError_ as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from None
