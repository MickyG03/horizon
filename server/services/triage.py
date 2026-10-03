"""Failure triage.

The hud SDK keeps only a string for whatever went wrong in a run (`trace.error`), and grades the
run regardless. That is how a provider 503 ends up as "reward 0" on a dashboard. `classify` turns
the error text, stop reason, reward and answer into a cause with a *kind*:

    ok      the run counts and succeeded (fully or partially)
    agent   the model got it wrong, ran out of steps, or produced a bad tool call -> counts
    infra   provider / network / quota / timeout -> excluded from the valid reward
    env     the environment failed to provision, start or clean up -> excluded
    grader  grading itself failed or was skipped -> excluded

Pure functions only; see tests/test_triage.py.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum


class Kind(StrEnum):
    OK = "ok"
    AGENT = "agent"
    INFRA = "infra"
    ENV = "env"
    GRADER = "grader"


@dataclass(frozen=True, slots=True)
class Cause:
    id: str
    kind: Kind
    label: str
    summary: str

    @property
    def counts_toward_reward(self) -> bool:
        return self.kind in (Kind.OK, Kind.AGENT)


def _c(id_: str, kind: Kind, label: str, summary: str) -> Cause:
    return Cause(id_, kind, label, summary)


CAUSES: dict[str, Cause] = {
    c.id: c
    for c in (
        _c("success", Kind.OK, "Success", "The answer was graded correct."),
        _c("partial", Kind.OK, "Partial credit", "The answer earned partial credit."),
        _c(
            "wrong_answer",
            Kind.AGENT,
            "Wrong answer",
            "The agent answered, and the grader rejected it.",
        ),
        _c("no_answer", Kind.AGENT, "No answer", "The agent finished without producing an answer."),
        _c(
            "truncated",
            Kind.AGENT,
            "Ran out of steps",
            "The agent hit the step or token limit before finishing.",
        ),
        _c(
            "malformed_tool_call",
            Kind.AGENT,
            "Malformed tool call",
            "The model produced a tool call the harness could not parse.",
        ),
        _c(
            "rate_limited",
            Kind.INFRA,
            "Rate limited",
            "The provider refused the request because of quota or rate limits. Not a model error.",
        ),
        _c(
            "provider_unavailable",
            Kind.INFRA,
            "Provider unavailable",
            "The provider returned a server error or was overloaded. Not a model error.",
        ),
        _c(
            "auth_or_credits",
            Kind.INFRA,
            "Auth / credits",
            "The provider rejected the credentials or the account has no credit.",
        ),
        _c(
            "model_not_found",
            Kind.INFRA,
            "Model not found",
            "The provider does not offer this model (or not to this account).",
        ),
        _c("timeout", Kind.INFRA, "Timed out", "The run exceeded its time budget."),
        _c(
            "unknown_error",
            Kind.INFRA,
            "Unknown error",
            "The run failed with an unclassified error.",
        ),
        _c(
            "env_error",
            Kind.ENV,
            "Environment error",
            "The environment failed to provision, start or clean up.",
        ),
        _c("grader_error", Kind.GRADER, "Grader error", "Grading raised an exception."),
        _c("ungraded", Kind.GRADER, "Not graded", "The run finished but no reward was recorded."),
        _c("cancelled", Kind.INFRA, "Cancelled", "The run was cancelled before it finished."),
    )
}

# Error strings from the SDK carry the phase in brackets: "[provisioning] RuntimeError: ...".
_PHASE = re.compile(r"^\[(?P<phase>[^\]]+)\]\s*(?P<rest>.*)$", re.DOTALL)
_ENV_PHASES = {"provisioning", "starting task", "cleanup", "snapshotting actor", "actor cleanup"}
_GRADER_PHASES = {"grading", "verifying", "provisioning verifier"}

_RATE_LIMITED = re.compile(r"\b429\b|RESOURCE_EXHAUSTED|rate[ _-]?limit|quota", re.I)
_UNAVAILABLE = re.compile(
    r"\b50[234]\b|UNAVAILABLE|overloaded|high demand|service unavailable|bad gateway", re.I
)
_AUTH = re.compile(
    r"\b40[13]\b|permission|credit|api[ _-]?key|unauthori[sz]ed|forbidden|authentication", re.I
)
_NOT_FOUND = re.compile(r"\b404\b|not found|no longer available|does not exist", re.I)
_TIMEOUT = re.compile(r"timed out|timeout|deadline exceeded", re.I)


def _provider_cause(text: str) -> Cause | None:
    if _RATE_LIMITED.search(text):
        return CAUSES["rate_limited"]
    if _UNAVAILABLE.search(text):
        return CAUSES["provider_unavailable"]
    if _AUTH.search(text):
        return CAUSES["auth_or_credits"]
    if _NOT_FOUND.search(text) and re.search(r"model", text, re.I):
        return CAUSES["model_not_found"]
    return None


def classify(
    *,
    error: str | None,
    stop_reason: str | None,
    reward: float | None,
    answer: str | None,
    status: str | None = None,
) -> Cause:
    """Map one run's outcome to a Cause. Errors first, then truncation, then the reward."""
    if status == "cancelled":
        return CAUSES["cancelled"]

    text = (error or "").strip()
    phase: str | None = None
    if match := _PHASE.match(text):
        phase, text = match.group("phase").strip().lower(), match.group("rest").strip()

    if phase in _ENV_PHASES:
        return CAUSES["env_error"]
    if phase in _GRADER_PHASES:
        return CAUSES["grader_error"]
    if stop_reason == "timeout" or (text and _TIMEOUT.search(text)):
        return CAUSES["timeout"]
    if text:
        return _provider_cause(text) or CAUSES["unknown_error"]
    if status == "error":
        return CAUSES["unknown_error"]

    if stop_reason in ("max_steps", "length"):
        return CAUSES["truncated"]
    if stop_reason == "malformed_tool_call":
        return CAUSES["malformed_tool_call"]

    if reward is None:
        return CAUSES["ungraded"]
    if reward >= 1:
        return CAUSES["success"]
    if reward > 0:
        return CAUSES["partial"]
    if answer and answer.strip():
        return CAUSES["wrong_answer"]
    return CAUSES["no_answer"]
