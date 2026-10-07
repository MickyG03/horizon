"use client";

import type { CSSProperties } from "react";

import { HorizonGauge } from "@/components/horizon/HorizonGauge";
import { LED } from "@/components/horizon/LED";
import { StatTile } from "@/components/horizon/StatTile";
import { fmtDuration, fmtPercent, fmtTokens } from "@/lib/format";
import type { Job } from "@/types/api";

import styles from "./SummaryTiles.module.css";

export function SummaryTiles({ job }: { job: Job }) {
  const s = job.summary;
  const running = job.status === "running" || job.status === "queued";
  const valid = s.valid_reward ?? null;
  const raw = s.raw_reward ?? null;
  const delta = valid != null && raw != null ? valid - raw : null;
  const progress = job.runs_total ? job.runs_done / job.runs_total : 0;

  return (
    <div className={styles.grid}>
      <div className={`surface rise ${styles.gaugeCard}`} style={{ "--i": 0 } as CSSProperties}>
        <HorizonGauge
          value={valid}
          ghost={raw}
          label="Valid reward"
          size={300}
          mosaic={running ? "live" : "still"}
          caption={
            valid == null
              ? running
                ? "Waiting for the first graded run."
                : s.infra_failures
                  ? `All ${s.infra_failures} run${s.infra_failures === 1 ? "" : "s"} failed on infrastructure, so there is no model score. hud.ai would report ${fmtPercent(raw)}.`
                  : "No run counted toward the reward."
              : delta != null && Math.abs(delta) > 0.0005
                ? `Raw score ${fmtPercent(raw)} (thin arc). ${s.infra_failures} infra failure${s.infra_failures === 1 ? "" : "s"} set aside.`
                : `${s.valid_n ?? 0} of ${s.done ?? 0} finished runs count. Raw and valid agree.`
          }
        />
      </div>

      <div className={styles.tiles}>
        <StatTile
          index={1}
          label="Raw reward"
          value={fmtPercent(raw)}
          numeric={raw != null ? { value: raw, format: (v) => fmtPercent(v) } : undefined}
          hint="Mean over every run, the way hud.ai reports it"
        />
        <StatTile
          index={2}
          label="Infra failures"
          accent={s.infra_failures ? "var(--cause-infra)" : undefined}
          value={s.infra_failures ?? 0}
          numeric={{ value: s.infra_failures ?? 0, format: (v) => String(Math.round(v)) }}
          hint="Provider, network, timeouts, environment"
        />
        <StatTile
          index={3}
          label="Runs"
          value={`${job.runs_done}/${job.runs_total}`}
          lamp={<LED color={running ? "var(--status-running)" : "var(--status-idle)"} pulse={running} />}
          hint={
            <span className={styles.progressWrap}>
              <span className={styles.progress}>
                <span className={styles.progressBar} style={{ width: `${progress * 100}%` }} data-live={running || undefined} />
              </span>
              {job.group_size} per task · {job.max_concurrent} concurrent
            </span>
          }
        />
        <StatTile
          index={4}
          label="Tokens"
          value={fmtTokens(s.tokens?.total)}
          hint={`${fmtTokens(s.tokens?.prompt)} in · ${fmtTokens(s.tokens?.completion)} out`}
        />
        <StatTile
          index={5}
          label="Mean run time"
          value={fmtDuration(s.duration_s?.mean)}
          hint={`longest ${fmtDuration(s.duration_s?.max)}`}
        />
        <StatTile
          index={6}
          label="Counted"
          value={`${s.valid_n ?? 0}/${s.done ?? 0}`}
          hint="Runs that are the model's own result"
        />
      </div>
    </div>
  );
}
