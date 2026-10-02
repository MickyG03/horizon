"use client";

import { useEffect, useRef } from "react";

import styles from "./HorizonBackdrop.module.css";

/* Ground plane geometry, in SVG units. The horizon is the top edge (y = 0). */
const W = 1000;
const H = 620;
const ROWS = 16;
const COLS = 15;
const COL_SPACING = 120;
const VANISH_X = W / 2;

// Rounded so server and client render byte-identical attributes (Math.pow can differ in the
// last ulp between V8 builds, which React reports as a hydration mismatch).
const round = (v: number) => Math.round(v * 100) / 100;

const rows = Array.from({ length: ROWS }, (_, i) => {
  const t = (i + 1) / ROWS;
  // Rows bunch up towards the horizon, like a floor seen in perspective.
  return { y: round(H * Math.pow(t, 2.4)), strong: (i + 1) % 4 === 0 };
});

const cols = Array.from({ length: COLS }, (_, i) => {
  const offset = (i - (COLS - 1) / 2) * COL_SPACING;
  return { x: round(VANISH_X + offset * 2.4), strong: offset === 0 };
});

export function HorizonBackdrop() {
  const ref = useRef<HTMLDivElement>(null);

  // Gentle parallax: the horizon recedes a little as the page scrolls.
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty("--parallax", `${window.scrollY * -0.05}px`);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} className={styles.backdrop} aria-hidden>
      <div className={styles.sky} />
      <div className={styles.glow} />
      <div className={styles.line} />
      <svg
        className={styles.ground}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        focusable="false"
      >
        <g className={styles.drift}>
          {cols.map(({ x, strong }) => (
            <line
              key={`c${x}`}
              x1={VANISH_X}
              y1={0}
              x2={x}
              y2={H}
              className={strong ? styles.strong : styles.faint}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {rows.map(({ y, strong }) => (
            <line
              key={`r${y}`}
              x1={0}
              y1={y}
              x2={W}
              y2={y}
              className={strong ? styles.strong : styles.faint}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
