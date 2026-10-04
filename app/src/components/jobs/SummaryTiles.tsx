"use client";

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

  return (
    <div className={styles.grid}>
      <StatTile
        label="Valid reward"
        accent="var(--cause-ok)"
        value={fmtPercent(valid)}
        numeric={valid != null ? { value: valid, format: (v) => fmtPercent(v) } : undefined}
        hint={
          delta != null && Math.abs(delta) > 0.0005 ? (
            <>
              <span className={styles.delta}>+{fmtPercent(delta)}</span> over the raw score once{" "}
              {s.infra_failures} infra failure{s.infra_failures === 1 ? "" : "s"} are set aside
            </>
          ) : (
            `${s.valid_n ?? 0} of ${s.done ?? 0} finished runs count`
          )
        }
      />
      <StatTile
        label="Raw reward"
        value={fmtPercent(raw)}
        numeric={raw != null ? { value: raw, format: (v) => fmtPercent(v) } : undefined}
        hint="Mean over every run, the way hud.ai reports it"
      />
      <StatTile
        label="Infra failures"
        accent={s.infra_failures ? "var(--cause-infra)" : undefined}
        value={s.infra_failures ?? 0}
        numeric={{ value: s.infra_failures ?? 0, format: (v) => String(Math.round(v)) }}
        hint="Provider, network, timeouts, environment"
      />
      <StatTile
        label="Runs"
        value={`${job.runs_done}/${job.runs_total}`}
        lamp={<LED color={running ? "var(--status-running)" : "var(--status-idle)"} pulse={running} />}
        hint={`${job.group_size} attempt${job.group_size === 1 ? "" : "s"} per task · ${
          job.max_concurrent
        } concurrent`}
      />
      <StatTile
        label="Tokens"
        value={fmtTokens(s.tokens?.total)}
        hint={`${fmtTokens(s.tokens?.prompt)} in · ${fmtTokens(s.tokens?.completion)} out`}
      />
      <StatTile
        label="Mean run time"
        value={fmtDuration(s.duration_s?.mean)}
        hint={`longest ${fmtDuration(s.duration_s?.max)}`}
      />
    </div>
  );
}
