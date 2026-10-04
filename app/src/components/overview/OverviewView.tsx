"use client";

import { ArrowRight, Boxes } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useMemo } from "react";

import { LED } from "@/components/horizon/LED";
import { Panel } from "@/components/horizon/Panel";
import { StatTile } from "@/components/horizon/StatTile";
import { JobsTable } from "@/components/jobs/JobsTable";
import { Button } from "@/components/primitives/Button";
import { EmptyState } from "@/components/primitives/EmptyState";
import { DUR, EASE } from "@theme/motion";
import { fmtPercent, fmtRelative, fmtTokens } from "@/lib/format";
import { useEnvs, useJobs } from "@/lib/queries";
import { useActivityFeed } from "@/lib/sse";
import { CAUSES, jobStatusColor, kindColor } from "@/lib/triage";
import type { HorizonEvent, Job, Run } from "@/types/api";

import styles from "./OverviewView.module.css";

function aggregate(jobs: Job[]) {
  let runs = 0;
  let validSum = 0;
  let validN = 0;
  let infra = 0;
  let done = 0;
  let tokens = 0;
  for (const j of jobs) {
    const s = j.summary;
    runs += j.runs_total;
    done += s.done ?? 0;
    infra += s.infra_failures ?? 0;
    tokens += s.tokens?.total ?? 0;
    if (s.valid_reward != null && s.valid_n) {
      validSum += s.valid_reward * s.valid_n;
      validN += s.valid_n;
    }
  }
  return {
    jobs: jobs.length,
    running: jobs.filter((j) => j.status === "running").length,
    runs,
    validReward: validN ? validSum / validN : null,
    infraRate: done ? infra / done : null,
    tokens,
  };
}

export function OverviewView() {
  const { data: envs } = useEnvs();
  const { data: jobs = [] } = useJobs({ limit: 200 });
  const { events, connected } = useActivityFeed();
  const agg = useMemo(() => aggregate(jobs), [jobs]);
  const noEnvs = envs && envs.length === 0;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <p className="t-overline">Local-first eval cockpit</p>
        <h1 className="t-display-1">
          Horizon<span className={styles.period}>.</span>
        </h1>
        <p className={styles.lede}>
          Run HUD environments against any model, watch every step as it happens, and see which
          failures were the model&apos;s fault, which were the grader&apos;s, and which were just
          the network.
        </p>
      </header>

      {noEnvs ? (
        <EmptyState
          icon={<Boxes size={20} />}
          title="Register your first environment"
          description="Point Horizon at a HUD tasks file. It reads the environment and its task templates, and from then on you can launch runs against it from anywhere in the app."
          action={
            <Link href="/envs">
              <Button variant="primary" icon={<ArrowRight size={14} />}>
                Go to environments
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className={styles.tiles}>
            <StatTile
              label="Valid reward"
              accent="var(--cause-ok)"
              value={fmtPercent(agg.validReward)}
              numeric={
                agg.validReward != null
                  ? { value: agg.validReward, format: (v) => fmtPercent(v) }
                  : undefined
              }
              hint="Across all finished runs that count"
            />
            <StatTile
              label="Infra failure rate"
              accent={agg.infraRate ? "var(--cause-infra)" : undefined}
              value={fmtPercent(agg.infraRate)}
              numeric={
                agg.infraRate != null ? { value: agg.infraRate, format: (v) => fmtPercent(v) } : undefined
              }
              hint="Runs lost to providers, quotas, timeouts, envs"
            />
            <StatTile
              label="Jobs"
              value={agg.jobs}
              numeric={{ value: agg.jobs, format: (v) => String(Math.round(v)) }}
              lamp={
                <LED
                  color={agg.running ? "var(--status-running)" : "var(--status-idle)"}
                  pulse={agg.running > 0}
                />
              }
              hint={agg.running ? `${agg.running} running now` : "none running"}
            />
            <StatTile
              label="Runs"
              value={agg.runs}
              numeric={{ value: agg.runs, format: (v) => String(Math.round(v)) }}
              hint={`${fmtTokens(agg.tokens)} tokens`}
            />
          </div>

          <div className={styles.columns}>
            <section className={styles.recent}>
              <div className={styles.sectionHead}>
                <h2 className="t-overline">Recent jobs</h2>
                <Link href="/jobs" className={styles.more}>
                  All jobs <ArrowRight size={12} />
                </Link>
              </div>
              {jobs.length ? (
                <JobsTable jobs={jobs.slice(0, 8)} />
              ) : (
                <EmptyState title="No jobs yet" description="Launch a run to see it here." />
              )}
            </section>

            <Panel
              eyebrow="Activity"
              title="Live feed"
              actions={
                <LED
                  color={connected ? "var(--status-success)" : "var(--status-idle)"}
                  pulse={connected}
                  label={connected ? "connected" : "disconnected"}
                />
              }
              className={styles.feed}
            >
              <ul className={styles.feedList}>
                <AnimatePresence initial={false}>
                  {events.length === 0 && (
                    <li className={styles.feedEmpty}>Events appear here as jobs run.</li>
                  )}
                  {events.map((event) => (
                    <motion.li
                      key={`${event.ts}-${event.type}-${event.run_id ?? ""}`}
                      className={styles.feedItem}
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: DUR.base, ease: EASE.out }}
                    >
                      <FeedLine event={event} />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function FeedLine({ event }: { event: HorizonEvent }) {
  const run = event.run_id ? (event.data as Run | null) : null;
  const jobData = !event.run_id ? (event.data as Partial<Job> | null) : null;

  let color = "var(--status-idle)";
  let text = event.type;
  if (event.type === "run.graded" && run?.cause) {
    const cause = CAUSES[run.cause];
    color = cause?.kind === "ok" ? "var(--cause-ok)" : kindColor(cause?.kind);
    text = `${run.slug} · ${cause?.label ?? run.cause} · ${run.reward ?? "—"}`;
  } else if (event.type === "run.failed" && run) {
    color = kindColor(run.cause_kind);
    text = `${run.slug} · ${CAUSES[run.cause ?? ""]?.label ?? "failed"}`;
  } else if (event.type === "run.started") {
    color = "var(--status-running)";
    text = `run started`;
  } else if (event.type.startsWith("job.")) {
    const status = event.type.slice(4);
    color = jobStatusColor(
      status === "started" ? "running" : (status as Job["status"]) ?? "queued",
    );
    text = `${jobData?.name ?? "job"} · ${status}`;
  }

  return (
    <Link href={event.run_id ? `/runs/${event.run_id}` : `/jobs/${event.job_id}`} className={styles.feedLink}>
      <LED color={color} size={7} />
      <span className={styles.feedText}>{text}</span>
      <span className={styles.feedTime}>{fmtRelative(event.ts)}</span>
    </Link>
  );
}
