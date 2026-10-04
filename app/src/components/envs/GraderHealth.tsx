"use client";

import { ShieldAlert, ShieldCheck, Stethoscope } from "lucide-react";
import { useState } from "react";

import { LED } from "@/components/horizon/LED";
import { Panel } from "@/components/horizon/Panel";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { ApiError } from "@/lib/api";
import { fmtPercent, fmtRelative } from "@/lib/format";
import { useProbes, useRunProbes } from "@/lib/queries";
import type { Env, ProbeTask } from "@/types/api";

import styles from "./GraderHealth.module.css";

export function GraderHealth({ env }: { env: Env }) {
  const { data: report } = useProbes(env.id);
  const run = useRunProbes(env.id);
  const error = run.error instanceof ApiError ? String(run.error.detail) : run.error?.message;
  const hasData = report && report.tasks.length > 0;
  const score = report?.score ?? null;
  const risky = score != null && score < 1;

  return (
    <Panel
      eyebrow="Grader health"
      title="Can these graders be gamed?"
      actions={
        <Button
          variant={hasData ? "secondary" : "primary"}
          icon={<Stethoscope size={14} />}
          loading={run.isPending}
          onClick={() => run.mutate(null)}
        >
          {run.isPending
            ? `Probing ${env.task_count} tasks…`
            : hasData
              ? "Probe again"
              : "Run probes"}
        </Button>
      }
    >
      <p className={styles.explainer}>
        Each task is fed {report?.probe_count ?? 10} junk answers through its real grading path: an
        empty reply, a refusal, the prompt echoed back, every digit at once, a bare &ldquo;yes&rdquo;,
        filler text, a JSON blob claiming success, a hedge across several answers. A healthy grader
        rejects all of them. Anything it accepts is a reward-hacking risk; a model trained on it
        will learn the shortcut.
      </p>

      {error && <div className={styles.error}>{error}</div>}

      {hasData && (
        <div className={styles.scoreRow}>
          <div className={styles.score} data-risky={risky || undefined}>
            {risky ? <ShieldAlert size={22} /> : <ShieldCheck size={22} />}
            <span className={`${styles.scoreValue} t-num`}>{fmtPercent(score)}</span>
            <span className={styles.scoreLabel}>of probes rejected</span>
          </div>
          <span className={styles.ranAt}>
            probed {fmtRelative(report.tasks[0]?.ran_at)}
          </span>
        </div>
      )}

      {hasData && (
        <ul className={styles.tasks}>
          {report.tasks.map((t) => (
            <TaskRow key={t.slug} task={t} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function TaskRow({ task }: { task: ProbeTask }) {
  const [open, setOpen] = useState(false);
  const risky = task.score != null && task.score < 1;
  return (
    <li className={styles.task}>
      <div className={styles.taskHead}>
        <LED color={risky ? "var(--cause-grader)" : "var(--status-success)"} />
        <span className={styles.slug}>{task.slug}</span>
        <span className={`${styles.taskScore} t-num`}>{fmtPercent(task.score)}</span>
        <button type="button" className={styles.toggle} onClick={() => setOpen((o) => !o)}>
          {open ? "hide probes" : "all probes"}
        </button>
      </div>

      {task.accepted.length > 0 && (
        <div className={styles.accepted}>
          <span className={styles.acceptedLabel}>Rewarded junk:</span>
          {task.accepted.map((a) => (
            <Badge
              key={a.probe}
              color="var(--cause-grader)"
              mono
              title={`${a.description}\n\n"${a.answer.slice(0, 200)}${a.answer.length > 200 ? "…" : ""}"\n\nreward ${a.reward}`}
            >
              {a.probe} → {a.reward}
            </Badge>
          ))}
        </div>
      )}

      {open && (
        <ul className={styles.probeList}>
          {task.probes.map((p) => (
            <li key={p.probe} className={styles.probe} data-accepted={p.accepted || undefined}>
              <span className={styles.probeMark}>{p.error ? "!" : p.accepted ? "✗" : "✓"}</span>
              <code className={styles.probeName}>{p.probe}</code>
              <span className={styles.probeDesc}>{p.description}</span>
              <span className={`${styles.probeReward} t-num`}>
                {p.error ? "error" : (p.reward ?? "—")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
