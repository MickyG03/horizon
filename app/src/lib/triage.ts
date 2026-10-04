/* Mirrors server/services/triage.py. */

import type { CauseKind, JobStatus, Run, RunStatus } from "@/types/api";

export interface CauseInfo {
  id: string;
  kind: CauseKind;
  label: string;
  summary: string;
}

const c = (id: string, kind: CauseKind, label: string, summary: string): CauseInfo => ({
  id,
  kind,
  label,
  summary,
});

export const CAUSES: Record<string, CauseInfo> = Object.fromEntries(
  [
    c("success", "ok", "Success", "The answer was graded correct."),
    c("partial", "ok", "Partial credit", "The answer earned partial credit."),
    c("wrong_answer", "agent", "Wrong answer", "The agent answered, and the grader rejected it."),
    c("no_answer", "agent", "No answer", "The agent finished without producing an answer."),
    c("truncated", "agent", "Ran out of steps", "The agent hit the step or token limit."),
    c("malformed_tool_call", "agent", "Malformed tool call", "The model produced an unparsable tool call."),
    c("rate_limited", "infra", "Rate limited", "The provider refused the request: quota or rate limit. Not a model error."),
    c("provider_unavailable", "infra", "Provider unavailable", "The provider returned a server error or was overloaded. Not a model error."),
    c("auth_or_credits", "infra", "Auth / credits", "The provider rejected the credentials or the account has no credit."),
    c("model_not_found", "infra", "Model not found", "The provider does not offer this model (or not to this account)."),
    c("timeout", "infra", "Timed out", "The run exceeded its time budget."),
    c("unknown_error", "infra", "Unknown error", "The run failed with an unclassified error."),
    c("env_error", "env", "Environment error", "The environment failed to provision, start or clean up."),
    c("grader_error", "grader", "Grader error", "Grading raised an exception."),
    c("ungraded", "grader", "Not graded", "The run finished but no reward was recorded."),
    c("cancelled", "infra", "Cancelled", "The run was cancelled before it finished."),
  ].map((x) => [x.id, x]),
);

export const KIND_LABEL: Record<CauseKind, string> = {
  ok: "Counted",
  agent: "Agent",
  infra: "Infrastructure",
  env: "Environment",
  grader: "Grader",
};

export const KIND_ORDER: CauseKind[] = ["ok", "agent", "infra", "env", "grader"];

export const kindColor = (kind: CauseKind | null | undefined) =>
  kind ? `var(--cause-${kind})` : "var(--status-idle)";

export function causeOf(run: Pick<Run, "cause" | "cause_kind">): CauseInfo | null {
  return run.cause ? (CAUSES[run.cause] ?? null) : null;
}

export const countsTowardReward = (run: Pick<Run, "cause" | "excluded" | "reward">) =>
  !run.excluded &&
  run.reward != null &&
  (run.cause === null || ["ok", "agent"].includes(CAUSES[run.cause]?.kind ?? ""));

/* Run colour: success/partial green, agent faults red, infra amber, env cyan, grader violet. */
export function runColor(run: Pick<Run, "status" | "cause" | "cause_kind" | "reward">): string {
  if (run.status === "running") return "var(--status-running)";
  if (run.status === "pending") return "var(--status-idle)";
  if (run.cause_kind === "ok") {
    return run.reward != null && run.reward < 1 ? "var(--status-warn)" : "var(--cause-ok)";
  }
  return kindColor(run.cause_kind);
}

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  queued: "Queued",
  running: "Running",
  finished: "Finished",
  cancelled: "Cancelled",
  failed: "Failed",
};

export function jobStatusColor(status: JobStatus): string {
  switch (status) {
    case "running":
      return "var(--status-running)";
    case "finished":
      return "var(--status-success)";
    case "failed":
      return "var(--status-error)";
    case "cancelled":
      return "var(--status-warn)";
    default:
      return "var(--status-idle)";
  }
}

export function runStatusColor(status: RunStatus): string {
  switch (status) {
    case "running":
      return "var(--status-running)";
    case "completed":
      return "var(--status-success)";
    case "error":
      return "var(--status-error)";
    case "cancelled":
      return "var(--status-warn)";
    default:
      return "var(--status-idle)";
  }
}
