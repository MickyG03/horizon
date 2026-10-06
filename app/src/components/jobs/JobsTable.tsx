"use client";

import { useRouter } from "next/navigation";

import { LED } from "@/components/horizon/LED";
import { Badge } from "@/components/primitives/Badge";
import table from "@/components/primitives/Table.module.css";
import { fmtDuration, fmtPercent, fmtRelative } from "@/lib/format";
import { CAUSES, JOB_STATUS_LABEL, jobStatusColor } from "@/lib/triage";
import type { Job, Run } from "@/types/api";

import { RunStrip } from "./RunStrip";
import styles from "./JobsTable.module.css";

/* The list endpoint carries no runs; synthesise lamps from the summary. */
function placeholderRuns(job: Job): Run[] {
  const runs: Run[] = [];
  let i = 0;
  for (const [cause, count] of Object.entries(job.summary.by_cause ?? {})) {
    for (let k = 0; k < count; k++) runs.push(stub(job, `${cause}-${i++}`, cause));
  }
  while (runs.length < job.runs_total) runs.push(stub(job, `p-${i++}`, null));
  return runs;
}

function stub(job: Job, id: string, cause: string | null): Run {
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
    cause_kind: cause ? (CAUSES[cause]?.kind ?? "infra") : null,
    excluded: false,
    started_at: null,
    ended_at: null,
    usage: {},
  };
}

/* `compact` folds model and env under the job name and drops the secondary columns, for narrow
   placements like the overview. */
export function JobsTable({ jobs, compact = false }: { jobs: Job[]; compact?: boolean }) {
  const router = useRouter();
  return (
    <div className={`surface rise ${table.wrap}`}>
      <table className={table.table}>
        <thead>
          <tr>
            <th>Job</th>
            {!compact && <th>Model</th>}
            <th>Runs</th>
            <th className={table.num}>Valid</th>
            {!compact && <th className={table.num}>Raw</th>}
            {!compact && <th className={table.num}>Infra</th>}
            {!compact && <th className={table.num}>Time</th>}
            <th className={table.num}>When</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => {
            const s = job.summary;
            const running = job.status === "running" || job.status === "queued";
            const delta =
              s.valid_reward != null && s.raw_reward != null ? s.valid_reward - s.raw_reward : 0;
            return (
              <tr
                key={job.id}
                data-clickable
                onClick={() => router.push(`/jobs/${job.id}`)}
                className={styles.row}
              >
                <td className={styles.nameCell}>
                  <div className={styles.name}>
                    <LED
                      color={jobStatusColor(job.status)}
                      pulse={running}
                      label={JOB_STATUS_LABEL[job.status]}
                    />
                    <div className={styles.nameText}>
                      <span className={styles.title}>
                        {compact ? job.model : job.name}
                      </span>
                      <span className={styles.sub}>
                        {job.env_name ?? job.env_id} · group {job.group_size} · {job.runs_done}/
                        {job.runs_total}
                      </span>
                    </div>
                  </div>
                </td>
                {!compact && (
                  <td>
                    <Badge mono>{job.model}</Badge>
                  </td>
                )}
                <td>
                  <RunStrip runs={placeholderRuns(job)} size="sm" />
                </td>
                <td className={`${table.num} ${styles.valid}`}>
                  {fmtPercent(s.valid_reward)}
                  {compact && delta > 0.0005 && (
                    <span className={styles.delta} title="Above the raw score">
                      +{fmtPercent(delta)}
                    </span>
                  )}
                </td>
                {!compact && (
                  <td className={`${table.num} ${table.muted}`}>{fmtPercent(s.raw_reward)}</td>
                )}
                {!compact && (
                  <td className={`${table.num} ${s.infra_failures ? styles.infra : table.muted}`}>
                    {s.infra_failures ?? 0}
                  </td>
                )}
                {!compact && (
                  <td className={`${table.num} ${table.muted}`}>
                    {fmtDuration(s.duration_s?.total)}
                  </td>
                )}
                <td className={`${table.num} ${table.muted}`}>{fmtRelative(job.created_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
