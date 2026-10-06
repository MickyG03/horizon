"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { LED } from "@/components/horizon/LED";
import { Badge } from "@/components/primitives/Badge";
import table from "@/components/primitives/Table.module.css";
import { fmtArgs, fmtDuration, fmtPercent, fmtReward, fmtTokens, secondsBetween } from "@/lib/format";
import { CAUSES, countsTowardReward, runColor } from "@/lib/triage";
import type { Run } from "@/types/api";

import styles from "./RunsTable.module.css";

type Group = { slug: string; taskId: string; args: Record<string, unknown>; runs: Run[] };

function groupRuns(runs: Run[]): Group[] {
  const map = new Map<string, Group>();
  for (const run of runs) {
    const g = map.get(run.slug) ?? { slug: run.slug, taskId: run.task_id, args: run.args, runs: [] };
    g.runs.push(run);
    map.set(run.slug, g);
  }
  return [...map.values()].map((g) => ({ ...g, runs: g.runs.sort((a, b) => a.attempt - b.attempt) }));
}

export function RunsTable({ runs }: { runs: Run[] }) {
  const groups = useMemo(() => groupRuns(runs), [runs]);

  return (
    <div className={`surface rise ${table.wrap}`}>
      <table className={table.table}>
        <thead>
          <tr>
            <th>Task</th>
            <th>Attempt</th>
            <th className={table.num}>Reward</th>
            <th>Outcome</th>
            <th>Answer</th>
            <th className={table.num}>Time</th>
            <th className={table.num}>Tokens</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const counted = g.runs.filter(countsTowardReward);
            const pass = counted.length
              ? counted.reduce((n, r) => n + (r.reward ?? 0), 0) / counted.length
              : null;
            return g.runs.map((run, i) => {
              const cause = run.cause ? CAUSES[run.cause] : null;
              const duration = secondsBetween(run.started_at, run.ended_at);
              return (
                <tr key={run.id} className={styles.row} data-excluded={run.excluded || undefined}>
                  {i === 0 && (
                    <td rowSpan={g.runs.length} className={styles.taskCell}>
                      <div className={styles.task}>
                        <span className={styles.taskId}>{g.taskId}</span>
                        <span className={styles.taskArgs}>{fmtArgs(g.args)}</span>
                        {g.runs.length > 1 && (
                          <span className={styles.groupRate}>
                            pass {fmtPercent(pass)} · {counted.length} counted
                          </span>
                        )}
                      </div>
                    </td>
                  )}
                  <td>
                    <span className={styles.attempt}>
                      <LED
                        color={runColor(run)}
                        pulse={run.status === "running"}
                        label={run.status}
                      />
                      #{run.attempt + 1}
                    </span>
                  </td>
                  <td className={`${table.num} ${styles.reward}`}>{fmtReward(run.reward)}</td>
                  <td>
                    {cause ? (
                      <Badge color={runColor(run)} title={cause.summary}>
                        {cause.label}
                      </Badge>
                    ) : (
                      <span className={table.muted}>{run.status}</span>
                    )}
                    {run.excluded && (
                      <Badge color="var(--fg-faint)" variant="outline" size="sm">
                        excluded
                      </Badge>
                    )}
                  </td>
                  <td className={styles.answer}>
                    {run.answer ? (
                      <code className={styles.answerText}>{run.answer}</code>
                    ) : run.error ? (
                      <span className={styles.errorText} title={run.error}>
                        {run.error}
                      </span>
                    ) : (
                      <span className={table.muted}>—</span>
                    )}
                  </td>
                  <td className={`${table.num} ${table.muted}`}>{fmtDuration(duration)}</td>
                  <td className={`${table.num} ${table.muted}`}>
                    {fmtTokens(
                      (run.usage.prompt_tokens ?? 0) + (run.usage.completion_tokens ?? 0) || null,
                    )}
                  </td>
                  <td className={table.num}>
                    <Link href={`/runs/${run.id}`} className={styles.trace}>
                      Trace <ArrowUpRight size={12} />
                    </Link>
                  </td>
                </tr>
              );
            });
          })}
        </tbody>
      </table>
    </div>
  );
}
