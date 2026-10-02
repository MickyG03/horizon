/* JavaScript mirror of motion.css for Framer Motion props (seconds, cubic-bezier arrays). */

export const DUR = {
  instant: 0.08,
  fast: 0.14,
  base: 0.22,
  slow: 0.4,
  glacial: 1.2,
} as const;

export const EASE = {
  out: [0.16, 1, 0.3, 1],
  inOut: [0.65, 0, 0.35, 1],
  spring: [0.34, 1.56, 0.64, 1],
} as const;

export const SPRING = {
  snappy: { type: "spring", stiffness: 420, damping: 32, mass: 0.8 },
  gentle: { type: "spring", stiffness: 180, damping: 26 },
} as const;
