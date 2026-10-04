"""Agents, and the one seam Horizon needs in the hud SDK.

The SDK has no callback API, but every step of a rollout, whatever its source, passes through
`Run.record(step)`. `streaming()` wraps an agent class so that, for each run it drives, `record`
also hands the step to a `StepSink`. That is how the UI sees prompts, reasoning, tool calls and
grades while they happen, without forking the SDK.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, Protocol

from hud.agents.base import Agent
from hud.agents.types import AgentConfig, AgentStep
from hud.telemetry.context import get_current_trace_id
from hud.types import Step

AGENT_TYPES = ("claude", "openai", "gemini", "openai_compatible", "scripted")


def normalize_trace_id(value: str | None) -> str | None:
    return value.replace("-", "").lower() if value else None


class StepSink(Protocol):
    def __call__(self, trace_id: str, step: Step) -> None: ...


class ScriptedConfig(AgentConfig):
    """An agent that answers with a fixed string. Used for grader probes and tests."""

    model: str = "scripted"
    answer: str = ""


class ScriptedAgent(Agent):
    config_cls = ScriptedConfig

    # Sentinel answer: reply with the task's own prompt (grader probes use it).
    ECHO_PROMPT = "__HORIZON_ECHO_PROMPT__"

    async def __call__(self, run: Any) -> None:
        text = self.config.answer  # type: ignore[attr-defined]
        if text == self.ECHO_PROMPT:
            text = getattr(run, "prompt_text", None) or ""
        run.trace.content = text  # the only thing the grader reads
        run.trace.stop_reason = "done"
        run.record(AgentStep(content=text, done=True))


def streaming(cls: type[Agent], sink: StepSink) -> type[Agent]:
    """Subclass `cls` so every step a run records also reaches `sink`."""

    class Streaming(cls):  # type: ignore[valid-type,misc]
        async def __call__(self, run: Any) -> None:
            trace_id = normalize_trace_id(get_current_trace_id()) or "unknown"

            # Run.__aenter__ already recorded the task setup and the user prompt.
            for step in run.trace.steps:
                sink(trace_id, step)

            original: Callable[[Step], None] = run.record

            def record(step: Step) -> None:
                original(step)
                sink(trace_id, step)

            run.record = record  # instance attribute shadows the method; grading uses it too
            await super().__call__(run)

    Streaming.__name__ = f"Streaming{cls.__name__}"
    Streaming.__qualname__ = Streaming.__name__
    return Streaming


def resolve_agent_class(agent_type: str) -> type[Agent]:
    if agent_type == "scripted":
        return ScriptedAgent
    from hud.types import AgentType

    try:
        return AgentType(agent_type).cls
    except ValueError:
        raise ValueError(f"Unknown agent type: {agent_type!r}") from None


def build_agent(
    *,
    agent_type: str,
    model: str,
    max_steps: int,
    agent_config: dict[str, Any] | None,
    sink: StepSink,
) -> Agent:
    cls = streaming(resolve_agent_class(agent_type), sink)
    extra = dict(agent_config or {})

    if agent_type == "scripted":
        return cls(ScriptedConfig(answer=str(extra.get("answer", ""))))

    if agent_type == "openai_compatible":
        # base_url/api_key are excluded from the SDK's dump()/load(), so build the config directly.
        from hud.agents.types import OpenAIChatConfig

        base_url = extra.pop("base_url", None)
        api_key = extra.pop("api_key", None) or "local"
        config = OpenAIChatConfig(
            model=model, max_steps=max_steps, base_url=base_url, api_key=api_key, **extra
        )
        return cls(config)

    return cls.load({"model": model, "max_steps": max_steps, **extra})
