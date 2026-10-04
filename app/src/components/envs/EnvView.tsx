"use client";

import { Play, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { JobsTable } from "@/components/jobs/JobsTable";
import { LaunchDrawer } from "@/components/jobs/LaunchDrawer";
import { Button } from "@/components/primitives/Button";
import { EmptyState } from "@/components/primitives/EmptyState";
import table from "@/components/primitives/Table.module.css";
import { PageHeader } from "@/components/shell/PageHeader";
import { fmtArgs, fmtRelative } from "@/lib/format";
import { useEnv, useJobs, useReloadEnv } from "@/lib/queries";

import styles from "./EnvView.module.css";

export function EnvView({ id }: { id: string }) {
  const { data: env, error } = useEnv(id);
  const { data: jobs = [] } = useJobs({ env_id: id, limit: 50 });
  const reload = useReloadEnv();
  const [launch, setLaunch] = useState(false);

  if (error) return <p className={styles.error}>{String(error)}</p>;
  if (!env) return null;

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow={
          <Link href="/envs" className={styles.crumb}>
            Environments
          </Link>
        }
        title={env.name}
        meta={
          <>
            <span className={styles.path} title={env.path}>
              {env.path}
            </span>
            <span>{env.task_count} tasks</span>
            <span>loaded {fmtRelative(env.last_loaded_at)}</span>
          </>
        }
        actions={
          <>
            <Button
              variant="ghost"
              icon={<RefreshCw size={14} />}
              loading={reload.isPending}
              onClick={() => reload.mutate(env.id)}
            >
              Reload
            </Button>
            <Button variant="primary" icon={<Play size={14} />} onClick={() => setLaunch(true)}>
              Run
            </Button>
          </>
        }
      />

      {env.load_error && <pre className={styles.loadError}>{env.load_error}</pre>}

      <section className={styles.section}>
        <h2 className="t-overline">Tasks</h2>
        <div className={table.wrap}>
          <table className={table.table}>
            <thead>
              <tr>
                <th>Template</th>
                <th>Arguments</th>
                <th>Slug</th>
                <th>Description</th>
                <th>Parameters</th>
              </tr>
            </thead>
            <tbody>
              {env.tasks.map((t) => (
                <tr key={t.slug}>
                  <td className={table.mono}>{t.id}</td>
                  <td className={table.mono}>{fmtArgs(t.args) || <span className={table.muted}>defaults</span>}</td>
                  <td className={`${table.mono} ${table.muted}`}>{t.slug}</td>
                  <td className={table.muted}>{t.description || "—"}</td>
                  <td className={table.muted}>
                    {Object.entries(t.params)
                      .map(([name, p]) => `${name}${p.type ? `: ${p.type}` : ""}${
                        p.required ? "" : ` = ${JSON.stringify(p.default)}`
                      }`)
                      .join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className="t-overline">Jobs on this environment</h2>
        {jobs.length ? (
          <JobsTable jobs={jobs} />
        ) : (
          <EmptyState
            title="Nothing run yet"
            description="Launch a run to see how models do on these tasks."
            action={
              <Button variant="primary" onClick={() => setLaunch(true)}>
                Run
              </Button>
            }
          />
        )}
      </section>

      <LaunchDrawer open={launch} onOpenChange={setLaunch} defaultEnvId={env.id} />
    </div>
  );
}
