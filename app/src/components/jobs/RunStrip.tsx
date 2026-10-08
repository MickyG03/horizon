import type { CSSProperties } from "react";

import { runColor } from "@/lib/triage";
import type { Run } from "@/types/api";

import styles from "./RunStrip.module.css";

const MAX_TILES = 40;

/* One lamp per run, lit by cause rather than pass/fail. Lamps switch on left to right. */
export function RunStrip({ runs, size = "md" }: { runs: Run[]; size?: "sm" | "md" }) {
  const shown = runs.slice(0, MAX_TILES);
  return (
    <div className={`${styles.strip} ${styles[size]}`} aria-label={`${runs.length} runs`}>
      {shown.map((run, i) => (
        <span
          key={run.id}
          className={styles.tile}
          data-running={run.status === "running" || undefined}
          data-pending={run.status === "pending" || undefined}
          style={{ "--tile-color": runColor(run), "--n": Math.min(i, 30) } as CSSProperties}
          title={`${run.slug}${run.cause ? ` · ${run.cause}` : ""}${
            run.reward != null ? ` · ${run.reward}` : ""
          }`}
        />
      ))}
      {runs.length > MAX_TILES && <span className={styles.more}>+{runs.length - MAX_TILES}</span>}
    </div>
  );
}
