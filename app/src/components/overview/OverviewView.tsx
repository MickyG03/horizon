"use client";

import { ArrowRight, Boxes, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useMemo, type CSSProperties } from "react";

import { HorizonGauge } from "@/components/horizon/HorizonGauge";
import { LED } from "@/components/horizon/LED";
import { Panel } from "@/components/horizon/Panel";
import { PixelIsland } from "@/components/horizon/PixelIsland";
import { CountUp, StatTile } from "@/components/horizon/StatTile";
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

const int = (v: number) => Math.round(v).toLocaleString("en-US");

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
      {/* The stage: words on the left, the island on the right, numbers along the bottom. */}
      <section className={`surface rise ${styles.stage}`}>
        <PixelIsland />
        <div className={styles.stageText}>
          <p className={`t-overline ${styles.eyebrow}`}>
            <LED
              color={health.isSuccess ? "var(--status-success)" : "var(--status-error)"}
              size={6}
            />
            {greeting()} · {health.isSuccess ? `hud ${health.data?.hud} · offline` : "api unreachable"}
          </p>
          <h1 className={styles.title}>
            See past
            <br />
            the <em>score.</em>
          </h1>
          <p className={styles.lede}>
            Run HUD environments against any model, watch every step as it happens, and learn which
            failures were the model&apos;s, which were the grader&apos;s, and which were just the
            network.
          </p>
          <div className={styles.heroActions}>
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
              <Button variant="secondary" icon={<ArrowRight size={14} />}>
                Browse jobs
              </Button>
            </Link>
          </div>
        </div>

        <dl className={styles.stageStats}>
          {[
            { label: "Task runs", value: agg.runs, fmt: int },
            { label: "Environments", value: agg.envs, fmt: int },
            { label: "Tokens", value: agg.tokens, fmt: (v: number) => fmtTokens(Math.round(v)) },
          ].map((s) => (
            <div key={s.label} className={styles.stageStat}>
              <dt>{s.label}</dt>
              <dd className="t-num">
                <CountUp value={s.value} format={s.fmt} />
              </dd>
            </div>
          ))}
        </dl>
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
          <div className={styles.readings}>
            <div className={`surface rise ${styles.gaugeCard}`} style={{ "--i": 1 } as CSSProperties}>
              <HorizonGauge
                value={agg.validReward}
                ghost={agg.rawReward}
                label="Valid reward"
                size={280}
                mosaic="live"
                caption={
                  agg.validReward == null
                    ? "No graded runs yet."
                    : delta != null && delta > 0.0005
                      ? `${fmtPercent(delta)} above the raw score once ${agg.infra} infrastructure failure${agg.infra === 1 ? "" : "s"} are set aside.`
                      : `Across ${agg.validN} counted run${agg.validN === 1 ? "" : "s"}.`
                }
              />
            </div>
            <StatTile
              index={2}
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
              index={3}
              label="Jobs"
              value={agg.jobs}
              numeric={{ value: agg.jobs, format: int }}
              lamp={
                <LED
                  color={agg.running ? "var(--status-running)" : "var(--status-idle)"}
                  pulse={agg.running > 0}
                />
              }
              hint={agg.running ? `${agg.running} running now` : "none running"}
            />
            <StatTile
              index={4}
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
              hint="of junk-answer probes rejected"
            />
          </div>

          <div className={styles.columns}>
            <Panel
              index={5}
              eyebrow="Recent jobs"
              title="Latest evals"
              actions={
                <Link href="/jobs" className={styles.more}>
                  All jobs <ArrowRight size={12} />
                </Link>
              }
              className={styles.recent}
            >
              {jobs && jobs.length ? (
                <JobsTable jobs={jobs.slice(0, 6)} compact bare />
              ) : (
                <p className={styles.muted}>No jobs yet. Launch a run to see it here.</p>
              )}
            </Panel>

            <Panel
              index={6}
              eyebrow="Activity"
              title="What happened"
              actions={
                <span className={styles.conn} data-on={connected || undefined}>
                  <LED
                    color={connected ? "var(--status-success)" : "var(--status-idle)"}
                    pulse={connected}
                    size={6}
                  />
                  {connected ? "live" : "offline"}
                </span>
              }
              className={styles.feed}
            >
              <ActivityList events={events} jobs={jobs ?? []} />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

type Line = { key: string; href: string; color: string; title: string; detail: string; ts: string };

/* Live events first, then the history of recent jobs, so the panel is never empty. */
function ActivityList({ events, jobs }: { events: HorizonEvent[]; jobs: Job[] }) {
  const lines = useMemo(() => {
    const live: Line[] = events.map((e) => eventLine(e));
    const seen = new Set(events.map((e) => e.job_id));
    const history: Line[] = jobs
      .filter((j) => !seen.has(j.id))
      .slice(0, 10)
      .map((j) => jobLine(j));
    return [...live, ...history].slice(0, 12);
  }, [events, jobs]);

  if (lines.length === 0) {
    return <p className={styles.muted}>Events land here the moment a run starts.</p>;
  }

  return (
    <ul className={styles.feedList}>
      <AnimatePresence initial={false}>
        {lines.map((l) => (
          <motion.li
            key={l.key}
            layout
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DUR.base, ease: EASE.out }}
          >
            <Link href={l.href} className={styles.feedLink}>
              <span className={styles.feedDot} style={{ background: l.color }} />
              <span className={styles.feedText}>
                <span className={styles.feedTitle}>{l.title}</span>
                <span className={styles.feedDetail}>{l.detail}</span>
              </span>
              <span className={styles.feedTime}>{fmtRelative(l.ts)}</span>
            </Link>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

function jobLine(j: Job): Line {
  const s = j.summary;
  const parts = [
    j.env_name ?? "env",
    s.valid_reward != null ? `${fmtPercent(s.valid_reward)} valid` : null,
    s.infra_failures ? `${s.infra_failures} infra` : null,
    `${j.runs_done}/${j.runs_total} runs`,
  ].filter(Boolean);
  return {
    key: `job-${j.id}`,
    href: `/jobs/${j.id}`,
    color: jobStatusColor(j.status),
    title: `${j.model} ${j.status}`,
    detail: parts.join(" · "),
    ts: j.finished_at ?? j.started_at ?? j.created_at,
  };
}

function eventLine(event: HorizonEvent): Line {
  const run = event.run_id ? (event.data as Run | null) : null;
  const job = !event.run_id ? (event.data as Partial<Job> | null) : null;
  const base = {
    key: `${event.ts}-${event.type}-${event.run_id ?? ""}`,
    href: event.run_id ? `/runs/${event.run_id}` : `/jobs/${event.job_id}`,
    ts: event.ts,
  };
  if ((event.type === "run.graded" || event.type === "run.failed") && run) {
    const cause = CAUSES[run.cause ?? ""];
    return {
      ...base,
      color: cause?.kind === "ok" ? "var(--cause-ok)" : kindColor(run.cause_kind),
      title: cause?.label ?? "Run finished",
      detail: `${run.slug}${run.reward != null ? ` · reward ${run.reward}` : ""}`,
    };
  }
  if (event.type === "run.started") {
    return {
      ...base,
      color: "var(--status-running)",
      title: "Run started",
      detail: event.run_id?.slice(0, 8) ?? "",
    };
  }
  const status = event.type.replace("job.", "");
  return {
    ...base,
    color: jobStatusColor(status === "started" ? "running" : ((status as Job["status"]) ?? "queued")),
    title: `${job?.model ?? "Job"} ${status}`,
    detail: job?.name ?? "",
  };
}
