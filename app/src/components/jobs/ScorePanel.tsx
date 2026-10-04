"use client";

import { Histogram } from "@/components/charts/Histogram";
import { KnurledSlider } from "@/components/horizon/KnurledSlider";
import { Panel } from "@/components/horizon/Panel";
import type { JobAnalytics } from "@/types/api";

import styles from "./ScorePanel.module.css";

type ScorePanelProps = {
  analytics: JobAnalytics | undefined;
  bins: number;
  onBinsChange: (bins: number) => void;
  validOnly: boolean;
  onValidOnlyChange: (valid: boolean) => void;
};

export function ScorePanel({ analytics, bins, onBinsChange, validOnly, onValidOnlyChange }: ScorePanelProps) {
  const hist = validOnly ? analytics?.histogram_valid : analytics?.histogram;
  return (
    <Panel
      eyebrow="Score distribution"
      title={validOnly ? "Rewards of runs that count" : "Rewards of every run"}
      actions={
        <div className={styles.segmented} role="group" aria-label="Which runs">
          <button type="button" data-active={!validOnly || undefined} onClick={() => onValidOnlyChange(false)}>
            Raw
          </button>
          <button type="button" data-active={validOnly || undefined} onClick={() => onValidOnlyChange(true)}>
            Valid
          </button>
        </div>
      }
    >
      {hist && hist.n > 0 ? (
        <Histogram bins={hist.bins} />
      ) : (
        <p className={styles.muted}>No graded runs yet.</p>
      )}
      <div className={styles.foot}>
        <KnurledSlider label="Bins" value={bins} onValueChange={onBinsChange} min={2} max={20} />
        <span className={styles.n}>{hist ? `${hist.n} run${hist.n === 1 ? "" : "s"}` : ""}</span>
      </div>
    </Panel>
  );
}
