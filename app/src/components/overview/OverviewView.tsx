"use client";

import { ArrowRight, Boxes, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useMemo, type CSSProperties } from "react";

import { HorizonGauge } from "@/components/horizon/HorizonGauge";
import { LED } from "@/components/horizon/LED";
import { Panel } from "@/components/horizon/Panel";
import { StatTile } from "@/components/horizon/StatTile";
import { JobsTable } from "@/components/jobs/JobsTable";
import { Button } from "@/components/primitives/Button";
import { EmptyState } from "@/components/primitives/EmptyState";
import { PageSkeleton } from "@/components/primitives/Skeleton";
import { DUR, EASE } from "@theme/motion";
import { fmtPercent, fmtRelative, fmtTokens } from "@/lib/format";
import { useEnvs, useHealth, useJobs } from "@/lib/queries";
import { useActivityFeed } from "@/lib/sse";
import { CAUSES, jobStatusColor, kindColor } from "@/lib/triage";
import type { Env, HorizonEvent, Job, Run } from "@/types/api";

import styles from "./OverviewView.module.css";

function aggregate(jobs: Job[], envs: Env[]) {
  let runs = 0;
  let validSum = 0;
  let validN = 0;
  let rawSum = 0;
  let rawN = 0;
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
    if (s.raw_reward != null && s.graded) {
      rawSum += s.raw_reward * s.graded;
      rawN += s.graded;
    }
  }
  const probed = envs.filter((e) => e.probe_score != null);
  return {
    jobs: jobs.length,
    running: jobs.filter((j) => j.status === "running").length,
    runs,
    done,
    validN,
    validReward: validN ? validSum / validN : null,
    rawReward: rawN ? rawSum / rawN : null,
    infra,
    infraRate: done ? infra / done : null,
    tokens,
    envs: envs.length,
    graderHealth: probed.length
      ? probed.reduce((n, e) => n + (e.probe_score ?? 0), 0) / probed.length
      : null,
  };
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Late night";
  if (h < 12) return "Morning";
  if (h < 18) return "Afternoon";
  return "Evening";
}

export function OverviewView() {
  const { data: envs } = useEnvs();
  const { data: jobs, isLoading } = useJobs({ limit: 200 });
  const health = useHealth();
  const { events, connected } = useActivityFeed();
  const agg = useMemo(() => aggregate(jobs ?? [], envs ?? []), [jobs, envs]);

  if (isLoading || !envs) return <PageSkeleton tiles={4} panels={1} />;

  const noEnvs = envs.length === 0;
  const delta =
    agg.validReward != null && agg.rawReward != null ? agg.validReward - agg.rawReward : null;

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <p className={`t-overline rise ${styles.eyebrow}`} style={{ "--i": 0 } as CSSProperties}>
            <LED
              color={health.isSuccess ? "var(--status-success)" : "var(--status-error)"}
              size={6}
            />
            {greeting()} · {health.isSuccess ? `hud ${health.data?.hud} · offline` : "api unreachable"}
          </p>
          <h1 className={`rise ${styles.title}`} style={{ "--i": 1 } as CSSProperties}>
            See past
            <br />
            the <em>score.</em>
          </h1>
          <p className={`rise ${styles.lede}`} style={{ "--i": 2 } as CSSProperties}>
            Run HUD environments against any model, watch every step as it happens, and learn which
            failures were the model&apos;s, which were the grader&apos;s, and which were just the
            network.
          </p>
          <div className={`rise ${styles.heroActions}`} style={{ "--i": 3 } as CSSProperties}>
            {noEnvs ? (
              <Link href="/envs">
                <Button variant="primary" icon={<Boxes size={14} />}>
                  Register an environment
                </Button>
              </Link>
            ) : (
              <Button
                variant="primary"
                icon={<Plus size={14} />}
                onClick={() => window.dispatchEvent(new Event("horizon:new-run"))}
              >
                New run
              </Button>
            )}
            <Link href="/jobs">
              <Button variant="ghost" icon={<ArrowRight size={14} />}>
                Browse jobs
              </Button>
            </Link>
          </div>
        </div>

        <div className={`rise ${styles.heroGauge}`} style={{ "--i": 2 } as CSSProperties}>
          <HorizonGauge
            value={agg.validReward}
            ghost={agg.rawReward}
            label="Valid reward"
            size={320}
            mosaic="live"
            caption={
              agg.validReward == null
                ? "No graded runs yet."
                : delta != null && delta > 0.0005
                  ? `${fmtPercent(delta)} above the raw score once ${agg.infra} infrastructure failure${agg.infra === 1 ? "" : "s"} are set aside. The thin arc is raw.`
                  : `Across ${agg.validN} counted run${agg.validN === 1 ? "" : "s"}. The thin arc is the raw score.`
            }
          />
        </div>
      </section>

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
              index={4}
              label="Infra failure rate"
              accent={agg.infraRate ? "var(--cause-infra)" : undefined}
              value={fmtPercent(agg.infraRate)}
              numeric={
                agg.infraRate != null
                  ? { value: agg.infraRate, format: (v) => fmtPercent(v) }
                  : undefined
              }
              hint={`${agg.infra} of ${agg.done} runs lost to providers, quotas, timeouts`}
            />
            <StatTile
              index={5}
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
              index={6}
              label="Runs"
              value={agg.runs}
              numeric={{ value: agg.runs, format: (v) => String(Math.round(v)) }}
              hint={`${fmtTokens(agg.tokens)} tokens`}
            />
            <StatTile
              index={7}
              label="Grader health"
              accent={
                agg.graderHealth != null && agg.graderHealth < 1 ? "var(--cause-grader)" : undefined
              }
              value={fmtPercent(agg.graderHealth)}
              numeric={
                agg.graderHealth != null
                  ? { value: agg.graderHealth, format: (v) => fmtPercent(v) }
                  : undefined
              }
              hint={`${agg.envs} environment${agg.envs === 1 ? "" : "s"} · probes rejected`}
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
              {jobs && jobs.length ? (
                <JobsTable jobs={jobs.slice(0, 6)} compact />
              ) : (
                <EmptyState title="No jobs yet" description="Launch a run to see it here." />
              )}
            </section>

            <Panel
              index={8}
              eyebrow="Activity"
              title="Live feed"
              actions={
                <span className={styles.conn} data-on={connected || undefined}>
                  <LED
                    color={connected ? "var(--status-success)" : "var(--status-idle)"}
                    pulse={connected}
                    size={6}
                  />
                  {connected ? "listening" : "offline"}
                </span>
              }
              className={styles.feed}
            >
              {events.length === 0 ? (
                <div className={styles.radar}>
                  <span className={styles.ring} />
                  <span className={styles.ring} style={{ animationDelay: "1s" }} />
                  <span className={styles.ring} style={{ animationDelay: "2s" }} />
                  <span className={styles.core} />
                  <p className={styles.radarText}>Events land here the moment a run starts.</p>
                </div>
              ) : (
                <ul className={styles.feedList}>
                  <AnimatePresence initial={false}>
                    {events.map((event) => (
                      <motion.li
                        key={`${event.ts}-${event.type}-${event.run_id ?? ""}`}
                        className={styles.feedItem}
                        layout
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: DUR.base, ease: EASE.out }}
                      >
                        <FeedLine event={event} />
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
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
    text = "run started";
  } else if (event.type.startsWith("job.")) {
    const status = event.type.slice(4);
    color = jobStatusColor(status === "started" ? "running" : ((status as Job["status"]) ?? "queued"));
    text = `${jobData?.name ?? "job"} · ${status}`;
  }

  return (
    <Link
      href={event.run_id ? `/runs/${event.run_id}` : `/jobs/${event.job_id}`}
      className={styles.feedLink}
    >
      <LED color={color} size={7} />
      <span className={styles.feedText}>{text}</span>
      <span className={styles.feedTime}>{fmtRelative(event.ts)}</span>
    </Link>
  );
}
