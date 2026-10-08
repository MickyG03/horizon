"use client";

import { Boxes, Hammer, Play, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, type CSSProperties } from "react";

import { LED } from "@/components/horizon/LED";
import { LaunchDrawer } from "@/components/jobs/LaunchDrawer";
import { Button } from "@/components/primitives/Button";
import { EmptyState } from "@/components/primitives/EmptyState";
import { PageHeader } from "@/components/shell/PageHeader";
import { fmtPercent, fmtRelative } from "@/lib/format";
import { useDeleteEnv, useEnvs, useReloadEnv } from "@/lib/queries";
import type { Env } from "@/types/api";

import { RegisterEnvForm } from "./RegisterEnvForm";
import styles from "./EnvsView.module.css";

export function EnvsView() {
  const { data: envs } = useEnvs();
  const [launchEnv, setLaunchEnv] = useState<string | null>(null);

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Environments"
        title="Tasks files Horizon knows about"
        description="Start one from a template, or register any HUD tasks file by path. Horizon reads the environment and its task templates; runs happen in their own subprocesses."
        actions={
          <Link href="/envs/new" className={styles.newButton}>
            <Hammer size={14} aria-hidden />
            New environment
          </Link>
        }
      />

      <RegisterEnvForm />

      {envs && envs.length === 0 ? (
        <EmptyState
          icon={<Boxes size={20} />}
          title="No environments yet"
          description="Build one from a template (Coding, Computer Use, Deep Research and more), or paste the absolute path of a tasks.py above."
          action={
            <Link href="/envs/new" className={styles.newButton}>
              <Hammer size={14} aria-hidden />
              New environment
            </Link>
          }
        />
      ) : (
        <div className={styles.grid}>
          {envs?.map((env, i) => (
            <EnvCard key={env.id} env={env} index={i} onRun={() => setLaunchEnv(env.id)} />
          ))}
        </div>
      )}

      <LaunchDrawer
        key={launchEnv ?? "none"}
        open={launchEnv !== null}
        onOpenChange={(o) => !o && setLaunchEnv(null)}
        defaultEnvId={launchEnv ?? undefined}
      />
    </div>
  );
}

function EnvCard({ env, onRun, index }: { env: Env; onRun: () => void; index: number }) {
  const reload = useReloadEnv();
  const remove = useDeleteEnv();
  const healthy = !env.load_error;

  return (
    <article className={`surface surface-interactive rise ${styles.card}`} style={{ "--i": index } as CSSProperties}>
      <header className={styles.head}>
        <LED
          color={healthy ? "var(--status-success)" : "var(--status-error)"}
          label={healthy ? "loaded" : "failed to load"}
        />
        <Link href={`/envs/${env.id}`} className={styles.name}>
          {env.name}
        </Link>
        <span className={styles.taskset}>{env.taskset_name}</span>
      </header>

      {(env.image || env.python) && (
        <div className={styles.runsIn}>
          {env.image ? `runs in ${env.image}` : "runs in its own .venv"}
        </div>
      )}

      <div className={styles.path} title={env.path}>
        {env.path}
      </div>

      <dl className={styles.stats}>
        <div>
          <dt>Tasks</dt>
          <dd>{env.task_count}</dd>
        </div>
        <div>
          <dt>Grader health</dt>
          <dd>{env.probe_score == null ? "not probed" : fmtPercent(env.probe_score)}</dd>
        </div>
        <div>
          <dt>Loaded</dt>
          <dd>{fmtRelative(env.last_loaded_at)}</dd>
        </div>
      </dl>

      {env.load_error && <pre className={styles.loadError}>{env.load_error}</pre>}

      <footer className={styles.actions}>
        <Button variant="primary" size="sm" icon={<Play size={12} />} onClick={onRun}>
          Run
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<RefreshCw size={12} />}
          loading={reload.isPending}
          onClick={() => reload.mutate(env.id)}
        >
          Reload
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<Trash2 size={12} />}
          loading={remove.isPending}
          onClick={() => {
            if (window.confirm(`Remove ${env.name} and all of its jobs from Horizon?`)) {
              remove.mutate(env.id);
            }
          }}
        >
          Remove
        </Button>
      </footer>
    </article>
  );
}
