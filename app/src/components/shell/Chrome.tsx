"use client";

import { useEffect, useState, type ReactNode } from "react";

import { LaunchDrawer } from "@/components/jobs/LaunchDrawer";

import { CommandPalette } from "./CommandPalette";
import { Sidebar } from "./Sidebar";
import styles from "./Chrome.module.css";

export const NEW_RUN_EVENT = "horizon:new-run";

/* Client shell: sidebar, command palette and the global "new run" drawer. Any component can open
   the drawer by dispatching NEW_RUN_EVENT on window. */
export function Chrome({ children }: { children: ReactNode }) {
  const [launchOpen, setLaunchOpen] = useState(false);

  useEffect(() => {
    const open = () => setLaunchOpen(true);
    window.addEventListener(NEW_RUN_EVENT, open);
    return () => window.removeEventListener(NEW_RUN_EVENT, open);
  }, []);

  return (
    <div className={styles.frame}>
      <Sidebar onNewRun={() => setLaunchOpen(true)} />
      <main className={styles.main}>{children}</main>
      <CommandPalette onNewRun={() => setLaunchOpen(true)} />
      <LaunchDrawer open={launchOpen} onOpenChange={setLaunchOpen} />
    </div>
  );
}
