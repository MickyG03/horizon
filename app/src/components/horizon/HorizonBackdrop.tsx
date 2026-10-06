"use client";

import { useEffect, useRef } from "react";

import styles from "./HorizonBackdrop.module.css";

/* The scene behind every page: a quiet sky, a soft sun resting on a single lit horizon line, and
   a flat field of fine gridlines that fades out toward the edges. Pure CSS layers; the only
   script is a gentle scroll parallax. */
export function HorizonBackdrop() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = Math.min(window.scrollY, 1200);
        el.style.setProperty("--parallax", `${y * -0.06}px`);
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
      <div className={styles.grid} />
      <div className={styles.sun} />
      <div className={styles.haze} />
      <div className={styles.line} />
      <div className={styles.grain} />
    </div>
  );
}
