"use client";

import { useEffect, useRef } from "react";

import styles from "./PixelIsland.module.css";

/* A floating island drawn in square cells, the same unit as the mosaic: grass, trees, a stream
   running through it, a cliff with a ragged underside, a low sun and drifting clouds. The cells
   dissolve in, then water glints, leaves stir and clouds drift. Colours come from --scene-*
   tokens, so the island follows the theme.

   The static scene is rendered once to an offscreen canvas; each frame blits it and draws only
   the moving cells on top (low frame rate, paused off screen, still under reduced motion). */

const CELL = 5;
const GAP = 1;
const STEP = CELL + GAP;
const FPS = 20;
const REVEAL_MS = 1400;

// Island geometry, in scene units: u across (0..1), v down (0..1)
const CX = 0.74;
const CY = 0.42;
const RX = 0.18; // half-width of the top surface, in u
const RY = 0.07; // half-depth of the top surface, in v
const DEPTH = 0.36; // how far the cliff hangs below the surface, in v

/* u is in surface half-widths from the centre; v is offset from the surface's middle line;
   h is trunk height and r canopy radius, both in v. */
const TREES = [
  { u: -0.72, v: 0.005, h: 0.1, r: 0.07 },
  { u: -0.38, v: -0.035, h: 0.15, r: 0.085 },
  { u: 0.28, v: -0.04, h: 0.12, r: 0.075 },
  { u: 0.62, v: 0.01, h: 0.16, r: 0.09 },
  { u: 0.86, v: 0.03, h: 0.07, r: 0.05 },
];

/* Each canopy is a small cluster of circles, so trees read as trees rather than blobs. */
const PUFFS = [
  { x: 0, y: 0, s: 1 },
  { x: -0.62, y: 0.32, s: 0.68 },
  { x: 0.6, y: 0.36, s: 0.64 },
  { x: 0.05, y: -0.55, s: 0.6 },
];

const CLOUDS = [
  { u: 0.12, v: 0.16, w: 0.09, h: 0.035, speed: 0.006 },
  { u: 0.45, v: 0.08, w: 0.07, h: 0.03, speed: 0.004 },
  { u: 0.86, v: 0.2, w: 0.08, h: 0.03, speed: 0.005 },
];

enum K {
  None = 0,
  Sun,
  Grass,
  Leaf,
  Trunk,
  Earth,
  Water,
}

const TOKENS = [
  "--scene-grass-1",
  "--scene-grass-2",
  "--scene-grass-3",
  "--scene-leaf-1",
  "--scene-leaf-2",
  "--scene-leaf-3",
  "--scene-earth-1",
  "--scene-earth-2",
  "--scene-earth-3",
  "--scene-earth-4",
  "--scene-moss",
  "--scene-water-1",
  "--scene-water-2",
  "--scene-trunk",
  "--scene-cloud",
  "--scene-sun",
] as const;
type Token = (typeof TOKENS)[number];

/* Deterministic value noise, so the island looks the same on every load. */
function hash(x: number, y: number) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function noise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  const u = s(xf);
  const v = s(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

type Cell = { kind: K; token: Token; alpha: number };

function classify(u: number, v: number, aspect: number): Cell | null {
  const dx = (u - CX) / RX;

  // Trees first: canopies sit above the surface and overlap it.
  for (const t of TREES) {
    const tu = CX + t.u * RX;
    const baseV = CY + t.v;
    const cv = baseV - t.h;
    for (const p of PUFFS) {
      const pr = t.r * p.s * (0.85 + 0.25 * noise(u * 120, v * 120));
      const du = (u - (tu + (p.x * t.r) / aspect)) * aspect;
      const dv = v - (cv + p.y * t.r);
      if (du * du + dv * dv < pr * pr) {
        const lit = dv < -pr * 0.25 && du < pr * 0.3;
        const n = noise(u * 70 + t.u * 13, v * 70);
        const shade: Token = lit ? "--scene-leaf-3" : n > 0.55 ? "--scene-leaf-2" : "--scene-leaf-1";
        return { kind: K.Leaf, token: shade, alpha: 1 };
      }
    }
    // trunk: a thin column from under the canopy down to the ground
    if (Math.abs((u - tu) * aspect) < 0.009 && v > cv && v < baseV + 0.012) {
      return { kind: K.Trunk, token: "--scene-trunk", alpha: 1 };
    }
  }

  // Top surface: an ellipse of grass with a stream winding through it.
  const ev = (v - CY) / RY;
  if (dx * dx + ev * ev <= 1) {
    const streamU = CX + 0.03 + 0.025 * Math.sin((v - CY) * 60);
    if (Math.abs(u - streamU) < 0.011 + 0.006 * (ev + 1)) {
      return { kind: K.Water, token: noise(u * 80, v * 80) > 0.6 ? "--scene-water-2" : "--scene-water-1", alpha: 1 };
    }
    const n = noise(u * 70, v * 70);
    const token = n > 0.66 ? "--scene-grass-3" : n < 0.33 ? "--scene-grass-2" : "--scene-grass-1";
    return { kind: K.Grass, token, alpha: 1 };
  }

  // Cliff: hangs from the surface's middle line down to a ragged point.
  if (Math.abs(dx) < 1 && v > CY) {
    const base = Math.sqrt(1 - dx * dx);
    const bottom =
      CY +
      DEPTH * base * (0.78 + 0.22 * noise(u * 18, 3)) +
      0.05 * (noise(u * 70, 7) - 0.5) * base;
    const rim = CY + RY * Math.sqrt(Math.max(0, 1 - dx * dx));
    if (v > rim - 0.001 && v < bottom) {
      const depth = (v - rim) / Math.max(0.0001, bottom - rim);
      const streak = noise(u * 140, v * 12);
      let token: Token;
      if (depth < 0.12) token = "--scene-moss";
      else if (streak > 0.68) token = "--scene-earth-3";
      else if (streak < 0.3) token = "--scene-earth-2";
      else token = "--scene-earth-1";
      if (depth > 0.75) token = "--scene-earth-4";
      // the underside thins into loose cells
      const alpha = depth > 0.85 ? 1 - (depth - 0.85) / 0.15 : 1;
      if (depth > 0.85 && hash(Math.floor(u * 400), Math.floor(v * 400)) > alpha) return null;
      return { kind: K.Earth, token, alpha: 1 };
    }
  }

  // Low sun, behind the island and to its right.
  const su = (u - (CX + 0.1)) * aspect;
  const sv = v - 0.24;
  const sr = 0.2;
  if (su * su + sv * sv < sr * sr) {
    const d = Math.sqrt(su * su + sv * sv) / sr;
    return { kind: K.Sun, token: "--scene-sun", alpha: 0.35 * (1 - d) + 0.08 };
  }

  return null;
}

export function PixelIsland({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const still = document.createElement("canvas");
    const sctx = still.getContext("2d")!;

    let cols = 0;
    let rows = 0;
    let aspect = 1;
    let cells: (Cell | null)[] = [];
    let seeds = new Float32Array(0);
    let water: number[] = [];
    let leaves: number[] = [];
    const colors = {} as Record<Token, string>;
    let raf = 0;
    let last = 0;
    let visible = true;
    const start = performance.now();

    const readColors = () => {
      const cs = getComputedStyle(canvas);
      for (const t of TOKENS) colors[t] = cs.getPropertyValue(t).trim() || "#888";
    };

    const paintCell = (c: CanvasRenderingContext2D, i: number, alpha = 1) => {
      const cell = cells[i];
      if (!cell) return;
      c.globalAlpha = cell.alpha * alpha;
      c.fillStyle = colors[cell.token];
      c.fillRect((i % cols) * STEP, Math.floor(i / cols) * STEP, CELL, CELL);
    };

    const bake = () => {
      still.width = canvas.width;
      still.height = canvas.height;
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sctx.clearRect(0, 0, still.width, still.height);
      for (let i = 0; i < cells.length; i++) paintCell(sctx, i);
      sctx.globalAlpha = 1;
    };

    const layout = () => {
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      cols = Math.max(1, Math.floor(width / STEP));
      rows = Math.max(1, Math.floor(height / STEP));
      aspect = width / Math.max(1, height);
      cells = new Array(cols * rows);
      seeds = new Float32Array(cols * rows);
      water = [];
      leaves = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          const cell = classify((c + 0.5) / cols, (r + 0.5) / rows, aspect);
          cells[i] = cell;
          seeds[i] = hash(c * 7 + 3, r * 13 + 1);
          if (cell?.kind === K.Water) water.push(i);
          if (cell?.kind === K.Leaf && seeds[i] > 0.86) leaves.push(i);
        }
      }
      bake();
    };

    const drawClouds = (t: number) => {
      ctx.fillStyle = colors["--scene-cloud"];
      for (const cl of CLOUDS) {
        const cu = ((cl.u + t * cl.speed) % 1.2) - 0.1;
        const c0 = Math.floor((cu - cl.w) * cols);
        const c1 = Math.ceil((cu + cl.w) * cols);
        const r0 = Math.floor((cl.v - cl.h) * rows);
        const r1 = Math.ceil((cl.v + cl.h) * rows);
        for (let r = Math.max(0, r0); r <= Math.min(rows - 1, r1); r++) {
          for (let c = Math.max(0, c0); c <= Math.min(cols - 1, c1); c++) {
            const i = r * cols + c;
            if (cells[i] && cells[i]!.kind !== K.Sun) continue; // behind the island
            const x = ((c + 0.5) / cols - cu) / cl.w;
            const y = ((r + 0.5) / rows - cl.v) / cl.h;
            // flat-bottomed, lumpy top
            const lump = 0.75 + 0.35 * Math.sin(x * 4.2 + cl.u * 10);
            if (y > 0.6 || x * x + (y < 0 ? (y / lump) ** 2 : y * y) > 1) continue;
            // fade out over the text side of the stage
            const side = Math.min(1, Math.max(0, ((c + 0.5) / cols - 0.42) / 0.12));
            if (side <= 0) continue;
            ctx.globalAlpha = 0.75 * (1 - Math.abs(x) * 0.35) * side;
            ctx.fillRect(c * STEP, r * STEP, CELL, CELL);
          }
        }
      }
    };

    const frame = (now: number) => {
      const t = (now - start) / 1000;
      const reveal = now - start;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (reveal < REVEAL_MS) {
        // dissolve in, cell by cell
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const p = reveal / REVEAL_MS;
        for (let i = 0; i < cells.length; i++) if (cells[i] && seeds[i] < p) paintCell(ctx, i);
        ctx.globalAlpha = 1;
        return;
      }

      ctx.drawImage(still, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawClouds(t);

      // water glints travel down the stream
      ctx.fillStyle = colors["--scene-water-2"];
      for (const i of water) {
        const r = Math.floor(i / cols);
        const g = Math.sin(r * 0.9 - t * 3 + seeds[i] * 4);
        if (g > 0.75) {
          ctx.globalAlpha = (g - 0.75) * 3.2;
          ctx.fillRect((i % cols) * STEP, r * STEP, CELL, CELL);
        }
      }

      // a few leaves catch the light
      ctx.fillStyle = colors["--scene-leaf-3"];
      for (const i of leaves) {
        const f = Math.sin(t * 1.6 + seeds[i] * 30);
        if (f > 0.5) {
          ctx.globalAlpha = (f - 0.5) * 1.6;
          ctx.fillRect((i % cols) * STEP, Math.floor(i / cols) * STEP, CELL, CELL);
        }
      }
      ctx.globalAlpha = 1;
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden) return;
      if (now - last < 1000 / FPS) return;
      last = now;
      frame(now);
    };

    readColors();
    layout();
    if (reduce) {
      ctx.drawImage(still, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawClouds(0);
    } else {
      raf = requestAnimationFrame(loop);
    }

    const resize = new ResizeObserver(() => {
      layout();
      if (reduce) ctx.drawImage(still, 0, 0);
    });
    resize.observe(canvas);

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(canvas);

    const themeWatch = new MutationObserver(() => {
      readColors();
      bake();
      if (reduce) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(still, 0, 0);
      }
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
  }, []);

  return (
    <div className={`${styles.wrap} ${className ?? ""}`} aria-hidden>
      <canvas ref={ref} className={styles.canvas} />
    </div>
  );
}
