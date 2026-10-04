"use client";

import { motion } from "motion/react";

import { LED } from "@/components/horizon/LED";
import { Panel } from "@/components/horizon/Panel";
import { DUR, EASE } from "@theme/motion";
import { fmtPercent } from "@/lib/format";
import { CAUSES, KIND_LABEL, KIND_ORDER, kindColor } from "@/lib/triage";
import type { CauseKind, JobSummary } from "@/types/api";

import styles from "./TriageBreakdown.module.css";

type Segment = { id: string; label: string; kind: CauseKind; count: number; color: string };

function segments(byCause: Record<string, number>): Segment[] {
  const out: Segment[] = Object.entries(byCause).map(([id, count]) => {
    const info = CAUSES[id];
    const kind = info?.kind ?? "infra";
    const color =
      id === "partial" ? "var(--status-warn)" : kindColor(kind);
    return { id, label: info?.label ?? id, kind, count, color };
  });
  return out.sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || b.count - a.count,
  );
}

export function TriageBreakdown({ summary }: { summary: Partial<JobSummary> }) {
  const segs = segments(summary.by_cause ?? {});
  const total = segs.reduce((n, s) => n + s.count, 0);
  const counted = segs
    .filter((s) => s.kind === "ok" || s.kind === "agent")
    .reduce((n, s) => n + s.count, 0);

  return (
    <Panel
      eyebrow="Triage"
      title="Why runs ended the way they did"
      actions={
        total > 0 && (
          <span className={styles.counted}>
            {counted}/{total} count toward the valid reward
          </span>
        )
      }
    >
      {total === 0 ? (
        <p className={styles.muted}>Nothing finished yet.</p>
      ) : (
        <>
          <div className={styles.bar} role="img" aria-label="Runs by cause">
            {segs.map((s) => (
              <motion.span
                key={s.id}
                className={styles.segment}
                style={{ background: s.color }}
                initial={{ flexGrow: 0 }}
                animate={{ flexGrow: s.count }}
                transition={{ duration: DUR.slow, ease: EASE.out }}
                title={`${s.label}: ${s.count}`}
              />
            ))}
          </div>
          <ul className={styles.legend}>
            {segs.map((s) => (
              <li key={s.id} className={styles.item}>
                <LED color={s.color} size={7} />
                <span className={styles.label}>{s.label}</span>
                <span className={styles.kind}>{KIND_LABEL[s.kind]}</span>
                <span className={`${styles.count} t-num`}>{s.count}</span>
                <span className={`${styles.pct} t-num`}>{fmtPercent(s.count / total)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
