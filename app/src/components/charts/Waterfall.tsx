"use client";

import { scaleLinear } from "d3-scale";
import { motion } from "motion/react";

import { DUR, EASE } from "@theme/motion";
import { fmtDuration } from "@/lib/format";
import type { Step } from "@/types/api";

import styles from "./Waterfall.module.css";

const KIND_COLOR: Record<string, string> = {
  user: "var(--status-info)",
  agent: "var(--accent)",
  tool: "var(--fg-muted)",
  task: "var(--status-success)",
  system: "var(--status-error)",
  subagent: "var(--fg-muted)",
};

type Row = { seq: number; label: string; source: string; start: number; end: number };

function rows(steps: Step[]): Row[] {
  const out: Row[] = [];
  for (const s of steps) {
    const a = s.started_at ?? s.payload.started_at;
    const b = s.ended_at ?? s.payload.ended_at;
    if (!a || !b) continue;
    const label =
      s.payload.source === "task"
        ? `${s.payload.task_call?.phase ?? "task"}`
        : s.payload.source === "agent"
          ? (s.payload.model ?? "agent")
          : s.payload.source === "tool"
            ? (s.payload.call?.name ?? "tool")
            : s.payload.source;
    out.push({ seq: s.seq, label, source: s.payload.source, start: Date.parse(a), end: Date.parse(b) });
  }
  return out;
}

/* Where the time went: one bar per timed step, on the run's own clock. */
export function Waterfall({ steps }: { steps: Step[] }) {
  const data = rows(steps);
  if (data.length === 0) return <p className={styles.empty}>No timings recorded yet.</p>;

  const t0 = Math.min(...data.map((d) => d.start));
  const t1 = Math.max(...data.map((d) => d.end));
  const span = Math.max(t1 - t0, 1);
  const x = scaleLinear().domain([0, span]).range([0, 100]);

  return (
    <div className={styles.waterfall} role="img" aria-label="Step durations">
      {data.map((d) => {
        const left = x(d.start - t0);
        const width = Math.max(x(d.end - d.start), 0.6);
        return (
          <div key={d.seq} className={styles.row}>
            <span className={styles.label}>{d.label}</span>
            <div className={styles.track}>
              <motion.span
                className={styles.bar}
                style={{ left: `${left}%`, background: KIND_COLOR[d.source] ?? "var(--fg-muted)" }}
                initial={{ width: 0 }}
                animate={{ width: `${width}%` }}
                transition={{ duration: DUR.slow, ease: EASE.out }}
                title={`${d.label}: ${fmtDuration((d.end - d.start) / 1000)}`}
              />
            </div>
            <span className={styles.time}>{fmtDuration((d.end - d.start) / 1000)}</span>
          </div>
        );
      })}
      <div className={styles.axis}>
        <span>0s</span>
        <span>{fmtDuration(span / 1000)}</span>
      </div>
    </div>
  );
}
