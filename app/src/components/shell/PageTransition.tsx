"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import { DUR, EASE } from "@theme/motion";

/* Each route fades and lifts in. Mounted from app/template.tsx, which remounts per navigation. */
export function PageTransition({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.slow, ease: EASE.out }}
    >
      {children}
    </motion.div>
  );
}
