"use client";

import { Ban, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { LED } from "@/components/horizon/LED";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { PageHeader } from "@/components/shell/PageHeader";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { useCancelJob, useDeleteJob, useJob, useJobAnalytics, useRerunJob } from "@/lib/queries";
import { useJobEvents } from "@/lib/sse";
import { JOB_STATUS_LABEL, jobStatusColor } from "@/lib/triage";

import { RunsTable } from "./RunsTable";
import { ScorePanel } from "./ScorePanel";
import { SignalPanel } from "./SignalPanel";
import { SummaryTiles } from "./SummaryTiles";
import { TriageBreakdown } from "./TriageBreakdown";
import styles from "./JobView.module.css";

export function JobView({ id }: { id: string }) {
  const router = useRouter();
  const { data: job, error } = useJob(id);
  const live = job?.status === "running" || job?.status === "queued";
  const connected = useJobEvents(id, Boolean(live));

  const [bins, setBins] = useState(5);
  const [validOnly, setValidOnly] = useState(false);
  const { data: analytics } = useJobAnalytics(id, bins, Boolean(live));

  const cancel = useCancelJob();
  const rerun = useRerunJob();
  const remove = useDeleteJob();

  if (error) {
    return <p className={styles.error}>{String(error)}</p>;
  }
  if (!job) return null;

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow={
          <Link href="/jobs" className={styles.crumb}>
            Jobs
          </Link>
        }
        title={job.name}
        meta={
          <>
            <span className={styles.status}>
              <LED color={jobStatusColor(job.status)} pulse={Boolean(live)} />
              {JOB_STATUS_LABEL[job.status]}
              {live && (
                <span className={styles.liveTag} data-connected={connected || undefined}>
                  {connected ? "live" : "connecting"}
                </span>
              )}
            </span>
            <Badge mono>{job.model}</Badge>
            <Badge>{job.agent_type}</Badge>
            <span>
              <Link href={`/envs/${job.env_id}`} className={styles.link}>
                {job.env_name ?? job.env_id}
              </Link>
            </span>
            <span>group {job.group_size}</span>
            <span>max {job.max_steps} steps</span>
            <span title={fmtDateTime(job.created_at)}>{fmtRelative(job.created_at)}</span>
          </>
        }
        actions={
          <>
            {live ? (
              <Button
                variant="danger"
                icon={<Ban size={14} />}
                loading={cancel.isPending}
                onClick={() => cancel.mutate(job.id)}
              >
                Cancel
              </Button>
            ) : (
              <>
                <Button
                  icon={<RotateCcw size={14} />}
                  loading={rerun.isPending}
                  onClick={async () => {
                    const next = await rerun.mutateAsync(job.id);
                    router.push(`/jobs/${next.id}`);
                  }}
                >
                  Rerun
                </Button>
                <Button
                  variant="ghost"
                  icon={<Trash2 size={14} />}
                  loading={remove.isPending}
                  onClick={async () => {
                    if (!window.confirm("Delete this job and all its runs?")) return;
                    await remove.mutateAsync(job.id);
                    router.push("/jobs");
                  }}
                >
                  Delete
                </Button>
              </>
            )}
          </>
        }
      />

      {job.error && <div className={styles.banner}>{job.error}</div>}

      <SummaryTiles job={job} />

      <div className={styles.columns}>
        <ScorePanel
          analytics={analytics}
          bins={bins}
          onBinsChange={setBins}
          validOnly={validOnly}
          onValidOnlyChange={setValidOnly}
        />
        <TriageBreakdown summary={job.summary} />
      </div>

      <SignalPanel analytics={analytics} groupSize={job.group_size} />

      <section className={styles.runs}>
        <h2 className="t-overline">Runs</h2>
        <RunsTable runs={job.runs} />
      </section>
    </div>
  );
}
