"use client";

import { useRouter } from "next/navigation";

import { Badge } from "@/components/primitives/Badge";
import table from "@/components/primitives/Table.module.css";
import { LED } from "@/components/horizon/LED";
import { fmtDuration, fmtPercent, fmtRelative } from "@/lib/format";
import { JOB_STATUS_LABEL, jobStatusColor } from "@/lib/triage";
import type { Job, Run } from "@/types/api";

import { RunStrip } from "./RunStrip";
import styles from "./JobsTable.module.css";

/* The list endpoint carries no runs; synthesise lamps from the summary when that's all we have. */
function placeholderRuns(job: Job): Run[] {
  const total = job.runs_total;
  const byCause = job.summary.by_cause ?? {};
  const runs: Run[] = [];
  let i = 0;
  for (const [cause, count] of Object.entries(byCause)) {
    for (let k = 0; k < count; k++) {
      runs.push(stub(job, `${cause}-${i++}`, cause));
    }
  }
  while (runs.length < total) runs.push(stub(job, `p-${i++}`, null));
  return runs;
}

function stub(job: Job, id: string, cause: string | null): Run {
  const kind = cause
    ? (["success", "partial"].includes(cause)
        ? "ok"
        : ["wrong_answer", "no_answer", "truncated", "malformed_tool_call"].includes(cause)
          ? "agent"
          : cause === "env_error"
            ? "env"
            : ["grader_error", "ungraded"].includes(cause)
              ? "grader"
              : "infra")
    : null;
  return {
    id,
    job_id: job.id,
    task_id: "",
    slug: "",
    args: {},
    group_id: null,
    attempt: 0,
    status: cause ? "completed" : job.status === "running" ? "running" : "pending",
    reward: cause === "partial" ? 0.5 : cause === "success" ? 1 : cause ? 0 : null,
    answer: null,
    stop_reason: null,
    error: null,
    cause,
    cause_kind: kind,
    excluded: false,
    started_at: null,
    ended_at: null,
    usage: {},
  };
}

export function JobsTable({ jobs }: { jobs: Job[] }) {
  const router = useRouter();
  return (
    <div className={table.wrap}>
      <table className={table.table}>
        <thead>
          <tr>
            <th>Job</th>
            <th>Model</th>
            <th>Runs</th>
            <th className={table.num}>Valid</th>
            <th className={table.num}>Raw</th>
            <th className={table.num}>Infra</th>
            <th className={table.num}>Time</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const s = job.summary;
            const running = job.status === "running" || job.status === "queued";
            return (
              <tr
                key={job.id}
                data-clickable
                onClick={() => router.push(`/jobs/${job.id}`)}
                className={styles.row}
              >
                <td>
                  <div className={styles.name}>
                    <LED
                      color={jobStatusColor(job.status)}
                      pulse={running}
                      label={JOB_STATUS_LABEL[job.status]}
                    />
                    <div className={styles.nameText}>
                      <span className={styles.title}>{job.name}</span>
                      <span className={styles.sub}>
                        {job.env_name ?? job.env_id} · group {job.group_size} · {job.runs_done}/
                        {job.runs_total}
                      </span>
                    </div>
                  </div>
                </td>
                <td>
                  <Badge mono>{job.model}</Badge>
                </td>
                <td>
                  <RunStrip runs={placeholderRuns(job)} size="sm" />
                </td>
                <td className={`${table.num} ${styles.valid}`}>{fmtPercent(s.valid_reward)}</td>
                <td className={`${table.num} ${table.muted}`}>{fmtPercent(s.raw_reward)}</td>
                <td className={`${table.num} ${s.infra_failures ? styles.infra : table.muted}`}>
                  {s.infra_failures ?? 0}
                </td>
                <td className={`${table.num} ${table.muted}`}>
                  {fmtDuration(s.duration_s?.total)}
                </td>
                <td className={table.muted}>{fmtRelative(job.created_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
