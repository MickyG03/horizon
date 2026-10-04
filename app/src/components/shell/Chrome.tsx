"use client";

import { useState, type ReactNode } from "react";

import { LaunchDrawer } from "@/components/jobs/LaunchDrawer";

import { CommandPalette } from "./CommandPalette";
import { Sidebar } from "./Sidebar";
import styles from "./Chrome.module.css";

/* Client shell: sidebar, command palette and the global "new run" drawer. */
export function Chrome({ children }: { children: ReactNode }) {
  const [launchOpen, setLaunchOpen] = useState(false);
  return (
    <div className={styles.frame}>
      <Sidebar onNewRun={() => setLaunchOpen(true)} />
      <main className={styles.main}>{children}</main>
      <CommandPalette onNewRun={() => setLaunchOpen(true)} />
      <LaunchDrawer open={launchOpen} onOpenChange={setLaunchOpen} />
    </div>
  );
}
