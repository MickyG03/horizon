import type { ComboboxItem } from "@/components/primitives/Combobox";
import type { Env, Job } from "@/types/api";

import { fmtRelative } from "./format";

/* Environments as picker items, most recently used first (latest job, else last load). */
export function envItems(envs: Env[], jobs: Job[] = []): ComboboxItem[] {
  const lastJob = new Map<string, string>();
  for (const j of jobs) {
    const prev = lastJob.get(j.env_id);
    if (!prev || j.created_at > prev) lastJob.set(j.env_id, j.created_at);
  }
  const recency = (e: Env) => lastJob.get(e.id) ?? e.last_loaded_at ?? e.registered_at;
  return [...envs]
    .sort((a, b) => recency(b).localeCompare(recency(a)))
    .map((e) => ({
      value: e.id,
      label: e.name,
      sublabel: `${e.task_count} task${e.task_count === 1 ? "" : "s"} · ${e.taskset_name}`,
      meta: fmtRelative(recency(e)),
    }));
}
