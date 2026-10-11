"use client";

import { ArrowRight, Ban, Copy, Play, Plus, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { LED } from "@/components/horizon/LED";
import { Panel } from "@/components/horizon/Panel";
import { LaunchDrawer } from "@/components/jobs/LaunchDrawer";
import { Button } from "@/components/primitives/Button";
import { PageSkeleton } from "@/components/primitives/Skeleton";
import { ApiError } from "@/lib/api";
import { slowStepHint } from "@/lib/buildHints";
import { fmtElapsed, fmtRelative } from "@/lib/format";
import { useBuild, useBuilderMachine, useCancelBuild, useRetryBuild } from "@/lib/queries";
import type { BuildStep, BuildStepStatus, EnvBuild } from "@/types/api";

import styles from "./BuildProgress.module.css";

const LAMP: Record<BuildStepStatus, string> = {
  pending: "var(--status-idle)",
  running: "var(--status-running)",
  done: "var(--status-success)",
  skipped: "var(--status-idle)",
  failed: "var(--status-error)",
  cancelled: "var(--status-warn)",
};

const BUILD_STATUS: Record<EnvBuild["status"], { label: string; color: string }> = {
  running: { label: "Building", color: "var(--status-running)" },
  succeeded: { label: "Ready", color: "var(--status-success)" },
  failed: { label: "Failed", color: "var(--status-error)" },
  cancelled: { label: "Cancelled", color: "var(--status-warn)" },
};

/* Seconds a step took, or has taken so far while it runs; null if it never started. */
function stepSeconds(step: BuildStep, now: number): number | null {
  if (!step.started_at) return null;
  const end = step.ended_at
    ? new Date(step.ended_at).getTime()
    : step.status === "running"
      ? now
      : null;
  return end === null ? null : Math.max(0, (end - new Date(step.started_at).getTime()) / 1000);
}

/* The current time, ticking every second while `live`. */
function useNow(live: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [live]);
  return now;
}

export function BuildProgress({ id }: { id: string }) {
  const { data: build, error } = useBuild(id);
  const { data: machine, refetch: recheck } = useBuilderMachine();
  const retry = useRetryBuild();
  const cancel = useCancelBuild();
  const [launch, setLaunch] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  const pinned = useRef(true);
  const now = useNow(build?.status === "running");

  // Keep the log pinned to the bottom while it grows, unless the reader scrolled up.
  const log = build?.log ?? "";
  useEffect(() => {
    const el = logRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [log]);

  if (error) return <p className={styles.error}>{String(error)}</p>;
  if (!build) return <PageSkeleton tiles={0} panels={1} />;

  const running = build.status === "running";
  // Ready means the tasks were served and graded, or verification was deliberately skipped.
  const verify = build.steps.find((s) => s.key === "verify");
  const ready =
    build.status === "succeeded" && (verify?.status === "done" || verify?.status === "skipped");
  const verifyOption = build.options.verify ?? true;
  const imageSkipped =
    build.runtime === "docker" &&
    build.steps.some((s) => s.key === "image" && s.status === "skipped");
  const actionError = retry.error ?? cancel.error;
  const actionMessage =
    actionError instanceof ApiError ? String(actionError.detail) : actionError?.message;
  const durations = build.steps.map((s) => stepSeconds(s, now));
  const timed = durations.filter((d): d is number => d !== null);
  const total = timed.length > 0 ? timed.reduce((a, b) => a + b, 0) : null;
  const status =
    build.status === "succeeded" && !ready
      ? { label: "Not verified", color: "var(--status-idle)" }
      : (BUILD_STATUS[build.status] ?? BUILD_STATUS.failed);

  return (
    <div className={styles.layout}>
      <Panel
        eyebrow={`${build.template_name} · ${fmtRelative(build.created_at)}`}
        title={build.name}
        actions={
          <span className={styles.status} data-status={build.status}>
            <LED color={status.color} pulse={running} />
            {status.label}
            {total !== null && <span className={styles.total}>{fmtElapsed(total)}</span>}
          </span>
        }
      >
        <ol className={styles.steps}>
          {build.steps.map((step, i) => {
            const hint = slowStepHint(step, durations[i], build.typical?.[step.key], log);
            return (
              <li key={step.key} className={styles.step} data-status={step.status}>
                <span className={styles.index}>{i + 1}</span>
                <LED
                  color={hint ? "var(--status-warn)" : LAMP[step.status]}
                  pulse={step.status === "running"}
                />
                <span className={styles.stepText}>
                  <span className={styles.label}>{step.label}</span>
                  {hint ? (
                    <span className={styles.hint} role="status">
                      <span className={styles.hintTitle}>{hint.title}</span>
                      <span>{hint.reason}</span>
                      {hint.lastLine && <code className={styles.hintLine}>{hint.lastLine}</code>}
                    </span>
                  ) : (
                    <span className={styles.detail}>
                      {step.status === "running" ? "working…" : (step.detail ?? step.status)}
                    </span>
                  )}
                </span>
                <span className={styles.duration}>
                  {durations[i] !== null && fmtElapsed(durations[i])}
                </span>
              </li>
            );
          })}
        </ol>

        {build.error && <p className={styles.error}>{build.error}</p>}
        {actionMessage && <p className={styles.error}>{actionMessage}</p>}

        <div className={styles.actions}>
          {running && (
            <Button
              variant="danger"
              icon={<Ban size={14} />}
              loading={cancel.isPending}
              onClick={() => cancel.mutate(build.id)}
            >
              Cancel
            </Button>
          )}
          {build.env_id && !running && (
            <>
              <Button variant="primary" icon={<Play size={14} />} onClick={() => setLaunch(true)}>
                Run it
              </Button>
              <Link href={`/envs/${build.env_id}`} className={styles.linkButton}>
                Open environment <ArrowRight size={14} />
              </Link>
            </>
          )}
          {(build.status === "failed" || build.status === "cancelled") && (
            <Button
              variant="primary"
              icon={<RotateCcw size={14} />}
              loading={retry.isPending}
              onClick={() => retry.mutate({ id: build.id, verify: verifyOption })}
            >
              Retry
            </Button>
          )}
          {!running && imageSkipped && machine?.docker_ready && (
            <Button
              variant="secondary"
              icon={<RotateCcw size={14} />}
              loading={retry.isPending}
              onClick={() => retry.mutate({ id: build.id, build_image: true, verify: verifyOption })}
            >
              Build the Docker image
            </Button>
          )}
          {!running && imageSkipped && !machine?.docker_ready && (
            <Button variant="ghost" onClick={() => void recheck()}>
              Check for Docker again
            </Button>
          )}
          {!running && (
            <Link href="/envs/new" className={styles.linkGhost}>
              <Plus size={14} /> Another
            </Link>
          )}
        </div>
      </Panel>

      <div className={styles.side}>
        <Panel eyebrow="Output" title="Build log" dense>
          <pre
            ref={logRef}
            className={styles.log}
            onScroll={(e) => {
              const el = e.currentTarget;
              pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            }}
          >
            {log || "Waiting for output…"}
          </pre>
        </Panel>

        {!running && build.next_steps.length > 0 && (
          <Panel eyebrow="From the template" title="Next steps" dense>
            <p className={styles.note}>
              Run these from <code>{build.directory}</code>.
            </p>
            <ul className={styles.commands}>
              {build.next_steps.map((cmd) => (
                <Command key={cmd} cmd={cmd} />
              ))}
            </ul>
          </Panel>
        )}
      </div>

      {build.env_id && (
        <LaunchDrawer
          key={build.env_id}
          open={launch}
          onOpenChange={setLaunch}
          defaultEnvId={build.env_id}
        />
      )}
    </div>
  );
}

function Command({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <li className={styles.command}>
      <code>{cmd}</code>
      <button
        type="button"
        className={styles.copy}
        aria-label="Copy command"
        onClick={() => {
          void navigator.clipboard.writeText(cmd).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          });
        }}
      >
        {copied ? "copied" : <Copy size={12} />}
      </button>
    </li>
  );
}
