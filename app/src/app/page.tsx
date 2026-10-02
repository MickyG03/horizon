import { Panel } from "@/components/horizon/Panel";

import styles from "./page.module.css";

export default function OverviewPage() {
  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <p className="t-overline">Local-first eval cockpit</p>
        <h1 className="t-display-1">
          Horizon<span className={styles.period}>.</span>
        </h1>
        <p className={styles.lede}>
          Run HUD environments against any model, watch every step as it happens, and see which
          failures were the model&apos;s fault, which were the grader&apos;s, and which were just the
          network.
        </p>
      </header>

      <Panel eyebrow="Getting started" title="No environments registered yet">
        <p className={styles.muted}>
          Point Horizon at a HUD tasks file to start running evals. Environments, jobs and traces
          will show up here.
        </p>
      </Panel>
    </div>
  );
}
