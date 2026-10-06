"use client";

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useId, type ReactNode } from "react";

import { DUR, EASE } from "@theme/motion";

import { CountUp } from "./StatTile";
import styles from "./HorizonGauge.module.css";

type HorizonGaugeProps = {
  /* 0..1, or null when there is nothing to show yet */
  value: number | null;
  /* A second reading drawn as a thin inner arc (e.g. the raw reward). */
  ghost?: number | null;
  label: ReactNode;
  caption?: ReactNode;
  size?: number;
};

const START = Math.PI; // left end of the arc
const R = 80;
const CX = 100;
const CY = 100;

function point(t: number, r = R) {
  const a = START + t * Math.PI;
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

function arc(r: number) {
  const a = point(0, r);
  const b = point(1, r);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 0 1 ${b.x} ${b.y}`;
}

const round = (v: number) => Math.round(v * 100) / 100;

/* A half-dial that reads like a sun on the horizon: the arc fills from coral through amber to
   lime as the reward rises. Ticks every 10%, a needle-free design with the number in the middle. */
export function HorizonGauge({ value, ghost, label, caption, size = 260 }: HorizonGaugeProps) {
  const id = useId().replace(/:/g, "");
  const v = value == null ? 0 : Math.max(0, Math.min(1, value));
  const ticks = Array.from({ length: 11 }, (_, i) => i / 10);

  // The tip rides the arc: animate progress, derive its coordinates every frame.
  const progress = useMotionValue(0);
  const tipX = useTransform(progress, (t) => point(t).x);
  const tipY = useTransform(progress, (t) => point(t).y);
  useEffect(() => {
    const controls = animate(progress, v, { duration: DUR.glacial, ease: EASE.out });
    return () => controls.stop();
  }, [v, progress]);

  return (
    <div className={styles.gauge} style={{ width: size }}>
      <div className={styles.dial}>
      <svg viewBox="0 0 200 112" className={styles.svg} role="img" aria-label={`${label}`}>
        <defs>
          <linearGradient id={`g-${id}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="var(--coral-400)" />
            <stop offset="50%" stopColor="var(--amber-400)" />
            <stop offset="100%" stopColor="var(--lime-400)" />
          </linearGradient>
          <filter id={`glow-${id}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        {/* recessed track */}
        <path d={arc(R)} className={styles.track} />

        {/* ticks */}
        {ticks.map((t) => {
          const a = point(t, R + 9);
          const b = point(t, R + (Math.round(t * 10) % 5 === 0 ? 16 : 12));
          return (
            <line
              key={t}
              x1={round(a.x)}
              y1={round(a.y)}
              x2={round(b.x)}
              y2={round(b.y)}
              className={styles.tick}
            />
          );
        })}

        {ghost != null && (
          <motion.path
            d={arc(R - 11)}
            className={styles.ghost}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: Math.max(0.001, Math.min(1, ghost)) }}
            transition={{ duration: DUR.glacial, ease: EASE.out }}
          />
        )}

        {value != null && (
          <>
            <motion.path
              d={arc(R)}
              className={styles.glow}
              stroke={`url(#g-${id})`}
              filter={`url(#glow-${id})`}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: Math.max(0.001, v) }}
              transition={{ duration: DUR.glacial, ease: EASE.out }}
            />
            <motion.path
              d={arc(R)}
              className={styles.fill}
              stroke={`url(#g-${id})`}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: Math.max(0.001, v) }}
              transition={{ duration: DUR.glacial, ease: EASE.out }}
            />
            <motion.circle cx={tipX} cy={tipY} r={4} className={styles.tip} />
          </>
        )}

        {/* the horizon */}
        <line x1="6" y1={CY + 0.5} x2="194" y2={CY + 0.5} className={styles.horizon} />
      </svg>

      <div className={styles.readout}>
        <span className={`${styles.value} t-num`}>
          {value == null ? "—" : <CountUp value={v * 100} format={(x) => `${Math.round(x)}%`} />}
        </span>
        <span className={styles.label}>{label}</span>
      </div>
      </div>
      {caption && <div className={styles.caption}>{caption}</div>}
    </div>
  );
}
