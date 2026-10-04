"use client";

import { GitCompare } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { LED } from "@/components/horizon/LED";
import { Badge } from "@/components/primitives/Badge";
import { EmptyState } from "@/components/primitives/EmptyState";
import { Select } from "@/components/primitives/Field";
import table from "@/components/primitives/Table.module.css";
import { PageHeader } from "@/components/shell/PageHeader";
import { fmtArgs, fmtDuration, fmtPercent, fmtRelative, fmtTokens } from "@/lib/format";
import { useCompare, useEnvs, useJobs } from "@/lib/queries";
import { jobStatusColor } from "@/lib/triage";
import type { Job } from "@/types/api";

import styles from "./CompareView.module.css";

function cellColor(rate: number | null): string {
  if (rate == null) return "transparent";
  const p = Math.round(rate * 100);
  return `color-mix(in srgb, var(--cause-ok) ${p}%, var(--cause-agent))`;
}

export function CompareView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selected = useMemo(
    () => (params.get("jobs") ?? "").split(",").filter(Boolean),
    [params],
  );
  const envParam = params.get("env") ?? "";

  const { data: envs = [] } = useEnvs();
  const { data: jobs = [] } = useJobs({ limit: 200 });

  const selectedJobs = jobs.filter((j) => selected.includes(j.id));
  const envId = envParam || selectedJobs[0]?.env_id || envs[0]?.id || "";
  const candidates = jobs.filter((j) => j.env_id === envId && j.status !== "queued");
  const compare = useCompare(selected);

  const update = (next: { jobs?: string[]; env?: string }) => {
    const q = new URLSearchParams();
    const jobIds = next.jobs ?? selected;
    const env = next.env ?? envId;
    if (env) q.set("env", env);
    if (jobIds.length) q.set("jobs", jobIds.join(","));
    router.replace(`${pathname}?${q.toString()}`);
  };

  const toggle = (job: Job) =>
    update({
      jobs: selected.includes(job.id) ? selected.filter((id) => id !== job.id) : [...selected, job.id],
    });

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Compare"
        title="Models, side by side"
        description="Pick jobs that ran the same environment. Each cell is the pass rate over counted attempts for one task under one job."
      />

      <div className={styles.picker}>
        <Select
          value={envId}
          onChange={(e) => update({ env: e.target.value, jobs: [] })}
          aria-label="Environment"
        >
          {envs.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </Select>
        <div className={styles.chips}>
          {candidates.length === 0 && (
            <span className={styles.none}>No finished jobs on this environment.</span>
          )}
          {candidates.map((job) => {
            const on = selected.includes(job.id);
            return (
              <button
                key={job.id}
                type="button"
                className={styles.chip}
                data-on={on || undefined}
                onClick={() => toggle(job)}
              >
                <LED color={jobStatusColor(job.status)} size={6} />
                <span className={styles.chipModel}>{job.model}</span>
                <span className={styles.chipMeta}>
                  {fmtPercent(job.summary.valid_reward)} · g{job.group_size} ·{" "}
                  {fmtRelative(job.created_at)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {selected.length === 0 ? (
        <EmptyState
          icon={<GitCompare size={20} />}
          title="Pick one or more jobs"
          description="Select jobs above to lay their per-task pass rates next to each other."
        />
      ) : (
        compare.data && (
          <div className={table.wrap}>
            <table className={`${table.table} ${styles.matrix}`}>
              <thead>
                <tr>
                  <th>Task</th>
                  {compare.data.columns.map((c) => (
                    <th key={c.job_id} className={styles.colHead}>
                      <Link href={`/jobs/${c.job_id}`} className={styles.colLink}>
                        <Badge mono>{c.model}</Badge>
                      </Link>
                      <span className={styles.colSub}>{fmtRelative(c.created_at)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compare.data.rows.map((row) => (
                  <tr key={row.slug}>
                    <td>
                      <div className={styles.task}>
                        <span className={styles.taskId}>{row.task_id}</span>
                        <span className={styles.taskArgs}>{fmtArgs(row.args)}</span>
                      </div>
                    </td>
                    {compare.data!.columns.map((c) => {
                      const cell = row.cells[c.job_id];
                      return (
                        <td key={c.job_id} className={styles.cell}>
                          {cell ? (
                            <span
                              className={`${styles.rate} t-num`}
                              style={{ background: cellColor(cell.pass_rate) }}
                              title={`${cell.n} counted attempt${cell.n === 1 ? "" : "s"} · ${cell.signal}`}
                            >
                              {fmtPercent(cell.pass_rate)}
                            </span>
                          ) : (
                            <span className={table.muted}>—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className={styles.footLabel}>Valid reward</td>
                  {compare.data.columns.map((c) => (
                    <td key={c.job_id} className={`${styles.cell} ${styles.footValue}`}>
                      {fmtPercent(c.summary.valid_reward)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className={styles.footLabel}>Infra failures</td>
                  {compare.data.columns.map((c) => (
                    <td key={c.job_id} className={styles.cell}>
                      {c.summary.infra_failures ?? 0}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className={styles.footLabel}>Tokens</td>
                  {compare.data.columns.map((c) => (
                    <td key={c.job_id} className={styles.cell}>
                      {fmtTokens(c.summary.tokens?.total)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className={styles.footLabel}>Mean run time</td>
                  {compare.data.columns.map((c) => (
                    <td key={c.job_id} className={styles.cell}>
                      {fmtDuration(c.summary.duration_s?.mean)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )
      )}
    </div>
  );
}
