"use client";

import Link from "next/link";
import type { CSSProperties } from "react";

import { Panel } from "@/components/horizon/Panel";
import { Badge } from "@/components/primitives/Badge";
import { fmtArgs, fmtPercent } from "@/lib/format";
import type { JobAnalytics, SignalAttempt, SignalClass, TaskSignal } from "@/types/api";

import styles from "./SignalPanel.module.css";

const SIGNAL: Record<SignalClass, { label: string; color: string; hint: string }> = {
  learnable: { label: "Learnable", color: "var(--cause-ok)", hint: "Mixed outcomes: non-zero advantages, this task moves the policy." },
  saturated: { label: "Saturated", color: "var(--status-info)", hint: "Every attempt passed: zero advantage, nothing left to learn here." },
  impossible: { label: "Impossible", color: "var(--cause-agent)", hint: "Every attempt failed: zero advantage, the policy gets no signal." },
  flat: { label: "Flat", color: "var(--status-warn)", hint: "Every attempt earned the same partial credit: zero advantage." },
  unknown: { label: "No data", color: "var(--status-idle)", hint: "No attempts counted yet." },
};

const MAX_VARIANCE = 0.25; // a 0/1 reward can't exceed this

export function SignalPanel({ analytics, groupSize }: { analytics: JobAnalytics | undefined; groupSize: number }) {
  const s = analytics?.signal;
  const tasks = analytics?.tasks ?? [];

  return (
    <Panel
      eyebrow="Training signal · GRPO"
      title="Which tasks would actually teach the model"
      actions={
        s && s.max_group > 1 ? (
          <div className={styles.chips}>
            {(["learnable", "saturated", "impossible", "flat"] as const).map((k) => (
              <span key={k} className={styles.chip} style={{ "--chip": SIGNAL[k].color } as CSSProperties}>
                <span className={styles.chipDot} />
                {s[k]} {SIGNAL[k].label.toLowerCase()}
              </span>
            ))}
          </div>
        ) : null
      }
    >
      <p className={styles.explainer}>
        For each task, every counted attempt gets an advantage: (reward − group mean) ÷ group std.
        GRPO pushes the policy toward attempts with positive advantage and away from negative ones,
        so a task where all attempts score the same contributes nothing.
        {groupSize <= 1 && (
          <>
            {" "}
            <strong>This job ran one attempt per task</strong>; launch with a group size of 2 or
            more to measure signal.
          </>
        )}
      </p>

      {s && s.max_group > 1 && (
        <div className={styles.kpis}>
          <div>
            <span className="t-overline">Zero-gradient tasks</span>
            <span className={`${styles.kpi} t-num`}>{fmtPercent(s.zero_gradient_fraction)}</span>
          </div>
          <div>
            <span className="t-overline">Mean variance</span>
            <span className={`${styles.kpi} t-num`}>
              {s.mean_variance == null ? "—" : s.mean_variance.toFixed(3)}
            </span>
          </div>
          <div>
            <span className="t-overline">Group size</span>
            <span className={`${styles.kpi} t-num`}>{s.max_group}</span>
          </div>
        </div>
      )}

      {tasks.length > 0 && (
        <ul className={styles.list}>
          {tasks.map((t) => (
            <TaskRow key={t.slug} task={t} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function TaskRow({ task }: { task: TaskSignal }) {
  const meta = SIGNAL[task.signal];
  const varPct = task.variance == null ? 0 : Math.min(1, task.variance / MAX_VARIANCE) * 100;
  return (
    <li className={styles.row}>
      <div className={styles.task}>
        <span className={styles.taskId}>{task.task_id}</span>
        <span className={styles.taskArgs}>{fmtArgs(task.args)}</span>
      </div>
      <Badge color={meta.color} title={meta.hint}>
        {meta.label}
      </Badge>
      <span className={`${styles.stat} t-num`} title="Pass rate over counted attempts">
        {fmtPercent(task.pass_rate)}
      </span>
      <div className={styles.varianceTrack} title={`variance ${task.variance?.toFixed(3) ?? "—"}`}>
        <span className={styles.varianceBar} style={{ width: `${varPct}%`, background: meta.color }} />
      </div>
      <div className={styles.attempts}>
        {task.attempts.map((a) => (
          <AttemptTile key={a.run_id} attempt={a} />
        ))}
      </div>
    </li>
  );
}

function AttemptTile({ attempt }: { attempt: SignalAttempt }) {
  const a = attempt.advantage;
  let background = "var(--status-idle)";
  if (attempt.counted && a != null) {
    const strength = Math.min(1, Math.abs(a));
    const pct = Math.round(25 + strength * 75);
    background =
      a > 0
        ? `color-mix(in srgb, var(--cause-ok) ${pct}%, var(--bg-inset))`
        : a < 0
          ? `color-mix(in srgb, var(--cause-agent) ${pct}%, var(--bg-inset))`
          : "var(--border-strong)";
  }
  const title = attempt.counted
    ? `#${attempt.attempt + 1} reward ${attempt.reward ?? "—"} · advantage ${a?.toFixed(2) ?? "—"}`
    : `#${attempt.attempt + 1} not counted (${attempt.excluded ? "excluded" : attempt.cause ?? attempt.status})`;
  return (
    <Link
      href={`/runs/${attempt.run_id}`}
      className={styles.tile}
      data-dim={!attempt.counted || undefined}
      style={{ background }}
      title={title}
      aria-label={title}
    />
  );
}
