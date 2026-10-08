"use client";

import { ArrowRight, Copy, Play, Plus, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { LED } from "@/components/horizon/LED";
import { Panel } from "@/components/horizon/Panel";
import { LaunchDrawer } from "@/components/jobs/LaunchDrawer";
import { Button } from "@/components/primitives/Button";
import { PageSkeleton } from "@/components/primitives/Skeleton";
import { ApiError } from "@/lib/api";
import { fmtRelative } from "@/lib/format";
import { useBuild, useBuilderMachine, useRetryBuild } from "@/lib/queries";
import type { BuildStepStatus } from "@/types/api";

import styles from "./BuildProgress.module.css";

const LAMP: Record<BuildStepStatus, string> = {
  pending: "var(--status-idle)",
  running: "var(--status-running)",
  done: "var(--status-success)",
  skipped: "var(--status-idle)",
  failed: "var(--status-error)",
};

export function BuildProgress({ id }: { id: string }) {
  const { data: build, error } = useBuild(id);
  const { data: machine, refetch: recheck } = useBuilderMachine();
  const retry = useRetryBuild();
  const [launch, setLaunch] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  const pinned = useRef(true);

  // Keep the log pinned to the bottom while it grows, unless the reader scrolled up.
  const log = build?.log ?? "";
  useEffect(() => {
    const el = logRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [log]);

  if (error) return <p className={styles.error}>{String(error)}</p>;
  if (!build) return <PageSkeleton tiles={0} panels={1} />;

  const running = build.status === "running";
  const imageSkipped =
    build.runtime === "docker" &&
    build.steps.some((s) => s.key === "image" && s.status === "skipped");
  const retryError =
    retry.error instanceof ApiError ? String(retry.error.detail) : retry.error?.message;

  return (
    <div className={styles.layout}>
      <Panel
        eyebrow={`${build.template_name} · ${fmtRelative(build.created_at)}`}
        title={build.name}
        actions={
          <span className={styles.status} data-status={build.status}>
            <LED
              color={
                running
                  ? "var(--status-running)"
                  : build.status === "succeeded"
                    ? "var(--status-success)"
                    : "var(--status-error)"
              }
              pulse={running}
            />
            {running ? "Building" : build.status === "succeeded" ? "Ready" : "Failed"}
          </span>
        }
      >
        <ol className={styles.steps}>
          {build.steps.map((step, i) => (
            <li key={step.key} className={styles.step} data-status={step.status}>
              <span className={styles.index}>{i + 1}</span>
              <LED color={LAMP[step.status]} pulse={step.status === "running"} />
              <span className={styles.stepText}>
                <span className={styles.label}>{step.label}</span>
                <span className={styles.detail}>
                  {step.status === "running" ? "working…" : (step.detail ?? step.status)}
                </span>
              </span>
            </li>
          ))}
        </ol>

        {build.error && <p className={styles.error}>{build.error}</p>}
        {retryError && <p className={styles.error}>{retryError}</p>}

        <div className={styles.actions}>
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
          {build.status === "failed" && (
            <Button
              variant="primary"
              icon={<RotateCcw size={14} />}
              loading={retry.isPending}
              onClick={() => retry.mutate({ id: build.id })}
            >
              Retry
            </Button>
          )}
          {!running && imageSkipped && machine?.docker_ready && (
            <Button
              variant="secondary"
              icon={<RotateCcw size={14} />}
              loading={retry.isPending}
              onClick={() => retry.mutate({ id: build.id, build_image: true })}
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
