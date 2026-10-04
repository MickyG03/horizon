"use client";

import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, type ReactNode } from "react";

import { DUR, EASE } from "@theme/motion";

import styles from "./StatTile.module.css";

type StatTileProps = {
  label: ReactNode;
  value: ReactNode;
  /* When set, the value animates (count-up) from its previous number. */
  numeric?: { value: number; format: (v: number) => string };
  hint?: ReactNode;
  accent?: string;
  lamp?: ReactNode;
};

export function StatTile({ label, value, numeric, hint, accent, lamp }: StatTileProps) {
  return (
    <div className={styles.tile} style={accent ? { borderTopColor: accent } : undefined}>
      <div className={styles.head}>
        <span className="t-overline">{label}</span>
        {lamp}
      </div>
      <div className={`${styles.value} t-num`}>
        {numeric ? <CountUp value={numeric.value} format={numeric.format} /> : value}
      </div>
      {hint && <div className={styles.hint}>{hint}</div>}
    </div>
  );
}

function CountUp({ value, format }: { value: number; format: (v: number) => string }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    const controls = animate(mv, value, { duration: DUR.slow, ease: EASE.out });
    return () => controls.stop();
  }, [value, mv]);
  return <motion.span>{text}</motion.span>;
}
