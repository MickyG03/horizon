"""Which agent types can run right now, judged from the keys the hud SDK can see.

Only booleans leave this module; key values are never read into responses.
"""

from __future__ import annotations

from typing import Any

from hud.settings import settings as hud_settings

PROVIDERS: list[dict[str, Any]] = [
    {
        "agent_type": "gemini",
        "label": "Gemini",
        "key_env": "GEMINI_API_KEY",
        "default_model": "gemini-3.8-flash",
        "models": ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.1-pro"],
    },
    {
        "agent_type": "claude",
        "label": "Claude",
        "key_env": "ANTHROPIC_API_KEY",
        "default_model": "claude-sonnet-4-6",
        "models": ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5"],
    },
    {
        "agent_type": "openai",
        "label": "OpenAI",
        "key_env": "OPENAI_API_KEY",
        "default_model": "gpt-5.4-mini",
        "models": ["gpt-5.4-mini", "gpt-5.4"],
    },
    {
        "agent_type": "openai_compatible",
        "label": "OpenAI-compatible (Ollama, LM Studio, ...)",
        "key_env": None,
        "default_model": "qwen2.5",
        "models": [],
    },
]


def _has_provider_key(agent_type: str) -> bool:
    return bool(
        {
            "gemini": hud_settings.gemini_api_key,
            "claude": hud_settings.anthropic_api_key,
            "openai": hud_settings.openai_api_key,
        }.get(agent_type)
    )


def list_providers() -> list[dict[str, Any]]:
    gateway = bool(hud_settings.api_key)
    out: list[dict[str, Any]] = []
    for p in PROVIDERS:
        if p["agent_type"] == "openai_compatible":
            available, via = True, "base_url"
        elif _has_provider_key(p["agent_type"]):
            available, via = True, "provider_key"
        elif gateway:
            # The SDK falls back to HUD's inference gateway, which bills HUD credits.
            available, via = True, "hud_gateway"
        else:
            available, via = False, None
        out.append({**p, "available": available, "via": via})
    return out
