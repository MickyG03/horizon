"use client";

import { useEffect, useRef } from "react";

import styles from "./Mosaic.module.css";

type Shape = "ring" | "band" | "field";

type MosaicProps = {
  /* ring: a pixel half-ring standing on the bottom edge (for the gauge); band: brightest along
     the middle; field: even, fading at the edges */
  shape?: Shape;
  /* ring only: 0..1, how far round the ring the cells are lit (the rest stay dim) */
  sweep?: number;
  /* CSS custom property holding the cell colour */
  tone?: "warm" | "cool";
  cell?: number;
  gap?: number;
  /* 0..1, peak opacity of a fully lit cell */
  intensity?: number;
  /* Keep shimmering after the dissolve-in; when false it settles on a still frame. */
  live?: boolean;
  className?: string;
};

const FPS = 24;
const REVEAL_MS = 900;
const LEVELS = 5; // quantised brightness: reads as pixels, not a gradient

/* A grid of small square cells. They dissolve in, in random order, then shimmer with a slow
   travelling wave, the pixel-mosaic motif on hud.ai. Drawn to a canvas at a low frame rate,
   paused when off screen or when the tab is hidden, and static under reduced motion. */
export function Mosaic({
  shape = "field",
  tone = "warm",
  cell = 6,
  gap = 2,
  intensity = 0.6,
  live = true,
  sweep = 1,
  className,
}: MosaicProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const step = cell + gap;

    let cols = 0;
    let rows = 0;
    let seeds = new Float32Array(0);
    let weights = new Float32Array(0);
    let color = "#ffb27a";
    let raf = 0;
    let last = 0;
    let visible = true;
    let start = performance.now();

    const readColor = () => {
      const v = getComputedStyle(canvas).getPropertyValue(`--mosaic-${tone}`).trim();
      if (v) color = v;
    };

    const layout = () => {
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      cols = Math.max(1, Math.floor(width / step));
      rows = Math.max(1, Math.floor(height / step));
      seeds = new Float32Array(cols * rows);
      weights = new Float32Array(cols * rows);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          seeds[i] = Math.random();
          const x = (c + 0.5) / cols;
          const y = (r + 0.5) / rows;
          let w: number;
          if (shape === "ring") {
            // half-ring centred on the bottom edge; the box is twice as wide as it is tall
            const dx = (x - 0.5) * 2;
            const dy = 1 - y;
            const d = Math.sqrt(dx * dx + dy * dy);
            w = Math.max(0, 1 - Math.abs(d - 0.72) / 0.13);
            const angle = Math.atan2(dy, -dx) / Math.PI; // 0 at the left end, 1 at the right
            if (angle > sweep) w *= 0.18;
          } else if (shape === "band") {
            w = (1 - Math.abs(y - 0.5) * 2) * Math.min(1, x * 4, (1 - x) * 4);
          } else {
            w = Math.min(1, x * 5, (1 - x) * 5, y * 5, (1 - y) * 5);
          }
          // sparse at the fringes, dense in the middle
          weights[i] = Math.random() < w * 1.15 ? w : 0;
        }
      }
    };

    const draw = (now: number) => {
      const t = (now - start) / 1000;
      const revealT = now - start;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = color;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          const w = weights[i];
          if (w === 0) continue;
          const s = seeds[i];
          if (revealT < s * REVEAL_MS) continue; // dissolve in, cell by cell
          const wave = 0.5 + 0.5 * Math.sin(c * 0.22 - r * 0.15 - t * 1.4);
          const flicker = 0.5 + 0.5 * Math.sin(t * (1.5 + s * 2.5) + s * 40);
          let v = w * (0.25 + 0.45 * wave + 0.3 * flicker);
          v = Math.round(v * LEVELS) / LEVELS;
          if (v <= 0) continue;
          ctx.globalAlpha = v * intensity;
          ctx.fillRect(c * step, r * step, cell, cell);
        }
      }
      ctx.globalAlpha = 1;
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden) return;
      if (now - last < 1000 / FPS) return;
      last = now;
      draw(now);
      const settled = now - start > REVEAL_MS + 200;
      if (settled && (!live || reduce)) cancelAnimationFrame(raf);
    };

    readColor();
    layout();
    if (reduce) {
      start = performance.now() - REVEAL_MS - 1;
      draw(performance.now());
    } else {
      raf = requestAnimationFrame(loop);
    }

    const resize = new ResizeObserver(() => {
      layout();
      draw(performance.now());
    });
    resize.observe(canvas);

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(canvas);

    // Theme switches change the colour token.
    const themeWatch = new MutationObserver(() => {
      readColor();
      draw(performance.now());
    });
    themeWatch.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      io.disconnect();
      themeWatch.disconnect();
    };
  }, [shape, tone, cell, gap, intensity, live, sweep]);

  return <canvas ref={ref} className={`${styles.mosaic} ${className ?? ""}`} aria-hidden />;
}
