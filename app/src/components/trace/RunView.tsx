"use client";

import Link from "next/link";
import { useState } from "react";

import { Waterfall } from "@/components/charts/Waterfall";
import { LED } from "@/components/horizon/LED";
import { Panel } from "@/components/horizon/Panel";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { PageHeader } from "@/components/shell/PageHeader";
import { fmtArgs, fmtDuration, fmtReward, fmtTokens, secondsBetween, shortId } from "@/lib/format";
import { useRun } from "@/lib/queries";
import { useRunEvents } from "@/lib/sse";
import { runColor, runStatusColor } from "@/lib/triage";

import { CauseCard } from "./CauseCard";
import { Timeline } from "./Timeline";
import styles from "./RunView.module.css";

export function RunView({ id }: { id: string }) {
  const { data, error } = useRun(id);
  const run = data?.run;
  const live = run?.status === "running" || run?.status === "pending";
  useRunEvents(run, Boolean(live));
  const [raw, setRaw] = useState(false);

  if (error) return <p className={styles.error}>{String(error)}</p>;
  if (!data || !run) return null;

  const duration = secondsBetween(run.started_at, run.ended_at);
  const tokens = (run.usage.prompt_tokens ?? 0) + (run.usage.completion_tokens ?? 0);

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow={
          <span className={styles.crumbs}>
            <Link href="/jobs">Jobs</Link>
            <span>/</span>
            <Link href={`/jobs/${data.job.id}`}>{data.job.name}</Link>
          </span>
        }
        title={
          <>
            {run.task_id}
            <span className={styles.titleArgs}> {fmtArgs(run.args)}</span>
          </>
        }
        meta={
          <>
            <span className={styles.status}>
              <LED color={runStatusColor(run.status)} pulse={Boolean(live)} />
              {run.status}
            </span>
            <span className={styles.reward} style={{ color: runColor(run) }}>
              reward {fmtReward(run.reward)}
            </span>
            <Badge mono>{data.job.model}</Badge>
            <span>attempt #{run.attempt + 1}</span>
            <span>{fmtDuration(duration)}</span>
            <span>{fmtTokens(tokens || null)} tokens</span>
            <span className={styles.id} title={run.id}>
              {shortId(run.id, 12)}
            </span>
          </>
        }
        actions={
          <Button variant="ghost" size="sm" onClick={() => setRaw((r) => !r)}>
            {raw ? "Hide raw JSON" : "Raw JSON"}
          </Button>
        }
      />

      <CauseCard run={run} />

      <div className={styles.columns}>
        <section className={styles.main}>
          <h2 className="t-overline">Trajectory · {data.steps.length} steps</h2>
          <Timeline steps={data.steps} run={run} />
        </section>

        <aside className={styles.side}>
          <Panel eyebrow="Timing" title="Where the time went" dense>
            <Waterfall steps={data.steps} />
          </Panel>

          <Panel eyebrow="Details" title="Run" dense>
            <dl className={styles.dl}>
              <dt>Task</dt>
              <dd className={styles.mono}>{run.slug}</dd>
              <dt>Answer</dt>
              <dd className={styles.mono}>{run.answer ?? "—"}</dd>
              <dt>Stop reason</dt>
              <dd className={styles.mono}>{run.stop_reason ?? "—"}</dd>
              <dt>Group</dt>
              <dd className={styles.mono}>{run.group_id ?? "—"}</dd>
              <dt>Tokens</dt>
              <dd className={styles.mono}>
                {fmtTokens(run.usage.prompt_tokens ?? 0)} in · {fmtTokens(run.usage.completion_tokens ?? 0)} out
                {run.usage.llm_calls ? ` · ${run.usage.llm_calls} call${run.usage.llm_calls === 1 ? "" : "s"}` : ""}
              </dd>
              <dt>Started</dt>
              <dd className={styles.mono}>{run.started_at ?? "—"}</dd>
              <dt>Ended</dt>
              <dd className={styles.mono}>{run.ended_at ?? "—"}</dd>
            </dl>
          </Panel>
        </aside>
      </div>

      {raw && (
        <Panel eyebrow="Raw" title="Run and steps as stored" dense>
          <pre className={styles.raw}>{JSON.stringify(data, null, 2)}</pre>
        </Panel>
      )}
    </div>
  );
}
