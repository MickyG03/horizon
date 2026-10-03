import pytest

from services.triage import CAUSES, Kind, classify

GEMINI_429 = (
    "429 RESOURCE_EXHAUSTED. {'error': {'code': 429, 'message': 'You exceeded your current "
    "quota, please check your plan and billing details.'}}"
)
GEMINI_503 = (
    "503 UNAVAILABLE. {'error': {'code': 503, 'message': 'This model is currently experiencing "
    "high demand. Spikes in demand are usually temporary. Please try again later.'}}"
)
GEMINI_404 = (
    "404 NOT_FOUND. {'error': {'code': 404, 'message': 'This model models/gemini-2.5-flash is "
    "no longer available to new users.'}}"
)
ANTHROPIC_403 = (
    "Error code: 403 - {'type': 'error', 'error': {'type': 'permission_error', 'message': "
    "\"team 'x' has no credit balance\"}}"
)


@pytest.mark.parametrize(
    ("error", "stop_reason", "reward", "answer", "status", "expected"),
    [
        # the three outcomes that count
        (None, "done", 1.0, "3", "completed", "success"),
        (None, "done", 0.5, "3", "completed", "partial"),
        (None, "done", 0.0, "2", "completed", "wrong_answer"),
        (None, "done", 0.0, "", "completed", "no_answer"),
        (None, "done", 0.0, None, "completed", "no_answer"),
        # agent limits
        (None, "max_steps", 0.0, None, "completed", "truncated"),
        (None, "length", 0.0, "partial text", "completed", "truncated"),
        (None, "malformed_tool_call", 0.0, None, "completed", "malformed_tool_call"),
        # provider errors as the hud SDK records them: bare str(exc), reward still 0
        (GEMINI_429, None, 0.0, None, "error", "rate_limited"),
        (GEMINI_503, None, 0.0, None, "error", "provider_unavailable"),
        (GEMINI_404, None, 0.0, None, "error", "model_not_found"),
        (ANTHROPIC_403, None, 0.0, None, "error", "auth_or_credits"),
        ("Connection error.", None, 0.0, None, "error", "unknown_error"),
        # phase-prefixed errors
        ("[provisioning] RuntimeError: docker not found", None, None, None, "error", "env_error"),
        ("[starting task] TimeoutError: env not ready", None, None, None, "error", "env_error"),
        (
            "[grading] ZeroDivisionError: division by zero",
            None,
            None,
            None,
            "error",
            "grader_error",
        ),
        ("[agent loop] 503 UNAVAILABLE", None, 0.0, None, "error", "provider_unavailable"),
        # timeouts
        ("agent timed out after 600s", "timeout", 0.0, None, "error", "timeout"),
        (
            "rollout timed out after 900s during agent loop",
            "timeout",
            None,
            None,
            "error",
            "timeout",
        ),
        # odd states
        (None, "done", None, "3", "completed", "ungraded"),
        (None, None, None, None, "error", "unknown_error"),
        (None, None, None, None, "cancelled", "cancelled"),
    ],
)
def test_classify(error, stop_reason, reward, answer, status, expected):
    cause = classify(
        error=error, stop_reason=stop_reason, reward=reward, answer=answer, status=status
    )
    assert cause.id == expected


def test_only_ok_and_agent_causes_count_toward_reward():
    counted = {c.id for c in CAUSES.values() if c.counts_toward_reward}
    assert counted == {
        "success",
        "partial",
        "wrong_answer",
        "no_answer",
        "truncated",
        "malformed_tool_call",
    }
    assert all(CAUSES[c].kind in (Kind.OK, Kind.AGENT) for c in counted)


def test_the_67_percent_story():
    """Two correct answers and one provider outage: raw mean 0.67, valid mean 1.0."""
    outcomes = [
        classify(error=None, stop_reason="done", reward=1.0, answer="3", status="completed"),
        classify(error=None, stop_reason="done", reward=1.0, answer="2", status="completed"),
        classify(error=GEMINI_503, stop_reason=None, reward=0.0, answer=None, status="error"),
    ]
    rewards = [1.0, 1.0, 0.0]
    raw = sum(rewards) / len(rewards)
    valid = [r for r, c in zip(rewards, outcomes, strict=True) if c.counts_toward_reward]
    assert round(raw, 2) == 0.67
    assert sum(valid) / len(valid) == 1.0
