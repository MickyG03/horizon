"use client";

import { motion } from "motion/react";

import { DUR, EASE } from "@theme/motion";
import { fmtPercent } from "@/lib/format";
import type { HistogramBin } from "@/types/api";

import styles from "./Histogram.module.css";

/* Reward colour for a bin: coral at 0, amber in the middle, lime at 1. */
function binColor(mid: number): string {
  if (mid < 0.5) {
    const p = Math.round(mid * 200);
    return `color-mix(in srgb, var(--amber-400) ${p}%, var(--coral-400))`;
  }
  const p = Math.round((mid - 0.5) * 200);
  return `color-mix(in srgb, var(--lime-400) ${p}%, var(--amber-400))`;
}

export function Histogram({ bins, height = 140 }: { bins: HistogramBin[]; height?: number }) {
  const max = Math.max(1, ...bins.map((b) => b.count));
  return (
    <div className={styles.chart} style={{ height }} role="img" aria-label="Reward distribution">
      <div className={styles.gridlines} aria-hidden>
        {[0.25, 0.5, 0.75].map((t) => (
          <span key={t} style={{ bottom: `${t * 100}%` }} />
        ))}
      </div>
      {bins.map((b) => {
        const mid = (b.lo + b.hi) / 2;
        return (
          <div key={b.lo} className={styles.column}>
            <span className={`${styles.count} t-num`}>{b.count || ""}</span>
            <div className={styles.well}>
              <motion.div
                className={styles.bar}
                style={{ background: binColor(mid) }}
                initial={{ height: 0 }}
                animate={{ height: `${(b.count / max) * 100}%` }}
                transition={{ duration: DUR.slow, ease: EASE.out }}
                title={`${fmtPercent(b.lo)}–${fmtPercent(b.hi)}: ${b.count}`}
              />
            </div>
            <span className={styles.tick}>
              {fmtPercent(b.lo)}
              {bins.length <= 6 ? `–${fmtPercent(b.hi)}` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}
