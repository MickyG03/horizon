from datetime import UTC, datetime

from db.models import Run
from services.analytics import group_stats, histogram, job_analytics, task_signal

NOW = datetime.now(UTC)


def run(slug: str, attempt: int, reward: float | None, cause: str, **kw) -> Run:
    kind = {
        "success": "ok",
        "partial": "ok",
        "wrong_answer": "agent",
        "provider_unavailable": "infra",
        "rate_limited": "infra",
    }[cause]
    return Run(
        id=f"{slug}-{attempt}",
        job_id="job",
        task_id=slug.split("-")[0],
        slug=slug,
        args={},
        group_id=slug,
        attempt=attempt,
        status="error" if kind == "infra" else "completed",
        reward=reward,
        cause=cause,
        cause_kind=kind,
        started_at=NOW,
        ended_at=NOW,
        **kw,
    )


def test_group_stats_classifies_signal():
    assert group_stats([1, 1, 1])["signal"] == "saturated"
    assert group_stats([0, 0, 0])["signal"] == "impossible"
    assert group_stats([0.5, 0.5])["signal"] == "flat"
    assert group_stats([])["signal"] == "unknown"

    mixed = group_stats([1, 0, 1, 0])
    assert mixed["signal"] == "learnable"
    assert mixed["pass_rate"] == 0.5
    assert abs(mixed["variance"] - 0.25) < 1e-9
    # GRPO advantages are centred on the group mean and symmetric here
    assert abs(sum(mixed["advantages"])) < 1e-6
    assert mixed["advantages"][0] > 0 > mixed["advantages"][1]


def test_task_signal_ignores_infra_and_excluded_runs():
    runs = [
        run("count-a", 0, 1.0, "success"),
        run("count-a", 1, 0.0, "wrong_answer"),
        run("count-a", 2, 0.0, "provider_unavailable"),  # infra: not a sample
        run("count-a", 3, 1.0, "success", excluded=True),  # manually excluded
        run("count-b", 0, 1.0, "success"),
        run("count-b", 1, 1.0, "success"),
    ]
    tasks = task_signal(runs)
    by_slug = {t["slug"]: t for t in tasks}

    a = by_slug["count-a"]
    assert a["n"] == 2 and a["attempts_total"] == 4 and a["excluded"] == 2
    assert a["signal"] == "learnable" and a["pass_rate"] == 0.5
    counted = [x for x in a["attempts"] if x["counted"]]
    assert [x["attempt"] for x in counted] == [0, 1]
    assert all(x["advantage"] is None for x in a["attempts"] if not x["counted"])

    b = by_slug["count-b"]
    assert b["signal"] == "saturated" and b["variance"] == 0

    # learnable tasks sort first
    assert tasks[0]["slug"] == "count-a"


def test_histogram_bins_and_valid_filter():
    runs = [
        run("t", 0, 1.0, "success"),
        run("t", 1, 0.5, "partial"),
        run("t", 2, 0.0, "provider_unavailable"),
    ]
    raw = histogram(runs, bins=2)
    assert [b["count"] for b in raw["bins"]] == [1, 2] and raw["n"] == 3
    valid = histogram(runs, bins=2, valid_only=True)
    assert [b["count"] for b in valid["bins"]] == [0, 2] and valid["n"] == 2


def test_job_analytics_shape():
    out = job_analytics([run("t", 0, 1.0, "success"), run("t", 1, 0.0, "wrong_answer")], bins=4)
    assert set(out) == {"summary", "histogram", "histogram_valid", "signal", "tasks"}
    assert out["signal"]["learnable"] == 1 and out["signal"]["zero_gradient_fraction"] == 0
