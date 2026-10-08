"""Provider API keys.

Keys entered in the UI are written to ~/.hud/.env (the file `hud set` writes) and applied to the
running hud SDK's settings, so the next run picks them up without a restart. Values never leave
this module except as a last-four hint.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path

from hud.settings import settings as hud_settings

from config import settings


@dataclass(frozen=True)
class KeySpec:
    provider: str
    label: str
    env: str
    attr: str  # field on hud.settings.Settings
    url: str  # where to get one


KEYS: dict[str, KeySpec] = {
    k.provider: k
    for k in (
        KeySpec(
            "anthropic",
            "Anthropic (Claude)",
            "ANTHROPIC_API_KEY",
            "anthropic_api_key",
            "https://console.anthropic.com/settings/keys",
        ),
        KeySpec(
            "openai",
            "OpenAI",
            "OPENAI_API_KEY",
            "openai_api_key",
            "https://platform.openai.com/api-keys",
        ),
        KeySpec(
            "gemini",
            "Google Gemini",
            "GEMINI_API_KEY",
            "gemini_api_key",
            "https://aistudio.google.com/apikey",
        ),
        KeySpec("hud", "HUD", "HUD_API_KEY", "api_key", "https://hud.ai/project/api-keys"),
    )
}

_VALID = re.compile(r"^[A-Za-z0-9_\-.:]{8,512}$")


class KeyError_(ValueError):
    """A key could not be saved."""


def _hint(value: str | None) -> str | None:
    if not value:
        return None
    return f"…{value[-4:]}" if len(value) > 8 else "set"


def _env_file() -> Path:
    return settings.hud_env_file


def _read_lines(path: Path) -> list[str]:
    return path.read_text().splitlines() if path.exists() else []


def _write_lines(path: Path, lines: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text("\n".join(lines) + ("\n" if lines else ""))
    os.chmod(tmp, 0o600)
    tmp.replace(path)


def _saved_in_file(env: str) -> bool:
    return any(line.split("=", 1)[0].strip() == env for line in _read_lines(_env_file()))


def status() -> list[dict]:
    out = []
    for spec in KEYS.values():
        value = getattr(hud_settings, spec.attr, None)
        out.append(
            {
                "provider": spec.provider,
                "label": spec.label,
                "env": spec.env,
                "url": spec.url,
                "set": bool(value),
                "hint": _hint(value),
                "saved_by_horizon": _saved_in_file(spec.env),
            }
        )
    return out


def set_key(provider: str, value: str) -> dict:
    spec = KEYS.get(provider)
    if spec is None:
        raise KeyError_(f"Unknown provider: {provider}")
    value = value.strip()
    if not _VALID.match(value):
        raise KeyError_("That doesn't look like an API key.")

    path = _env_file()
    lines = [ln for ln in _read_lines(path) if ln.split("=", 1)[0].strip() != spec.env]
    lines.append(f"{spec.env}={value}")
    _write_lines(path, lines)

    os.environ[spec.env] = value
    setattr(hud_settings, spec.attr, value)
    return next(s for s in status() if s["provider"] == provider)


def clear_key(provider: str) -> dict:
    spec = KEYS.get(provider)
    if spec is None:
        raise KeyError_(f"Unknown provider: {provider}")
    path = _env_file()
    lines = _read_lines(path)
    kept = [ln for ln in lines if ln.split("=", 1)[0].strip() != spec.env]
    if kept != lines:
        _write_lines(path, kept)
    os.environ.pop(spec.env, None)
    setattr(hud_settings, spec.attr, None)
    return next(s for s in status() if s["provider"] == provider)
