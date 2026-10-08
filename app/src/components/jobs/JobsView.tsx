"use client";

import { ListChecks, Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/primitives/Button";
import { EmptyState } from "@/components/primitives/EmptyState";
import { Combobox } from "@/components/primitives/Combobox";
import { Select } from "@/components/primitives/Select";
import { PageHeader } from "@/components/shell/PageHeader";
import { envItems } from "@/lib/envs";
import { useEnvs, useJobs } from "@/lib/queries";

import { JobsTable } from "./JobsTable";
import { LaunchDrawer } from "./LaunchDrawer";
import styles from "./JobsView.module.css";

const STATUSES = ["", "running", "finished", "failed", "cancelled"] as const;

export function JobsView() {
  const [status, setStatus] = useState("");
  const [envId, setEnvId] = useState("");
  const [launch, setLaunch] = useState(false);
  const { data: envs = [] } = useEnvs();
  const jobs = useJobs({ status: status || undefined, env_id: envId || undefined, limit: 200 });
  const { data: allJobs = [] } = useJobs({ limit: 200 });

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Jobs"
        title="Every eval you've launched"
        description="One row per job: valid reward next to the raw score, and a lamp per run coloured by what actually happened."
        actions={
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => setLaunch(true)}>
            New run
          </Button>
        }
      />

      <div className={styles.filters}>
        <Select
          value={status}
          onChange={setStatus}
          size="sm"
          aria-label="Status"
          options={STATUSES.map((s) => ({
            value: s,
            label: s ? s[0].toUpperCase() + s.slice(1) : "Any status",
          }))}
        />
        <Combobox
          value={envId}
          onChange={setEnvId}
          items={envItems(envs, allJobs)}
          clearLabel="Any environment"
          searchPlaceholder="Search environments…"
          size="sm"
          aria-label="Environment"
        />
        <span className={styles.count}>
          {jobs.data ? `${jobs.data.length} job${jobs.data.length === 1 ? "" : "s"}` : ""}
        </span>
      </div>

      {jobs.data && jobs.data.length === 0 ? (
        <EmptyState
          icon={<ListChecks size={20} />}
          title="No jobs yet"
          description={
            envs.length
              ? "Launch a run against one of your environments to see results here."
              : "Register an environment first, then launch a run."
          }
          action={
            <Button variant="primary" onClick={() => setLaunch(true)} disabled={!envs.length}>
              New run
            </Button>
          }
        />
      ) : (
        jobs.data && <JobsTable jobs={jobs.data} />
      )}

      <LaunchDrawer open={launch} onOpenChange={setLaunch} defaultEnvId={envId || undefined} />
    </div>
  );
}
