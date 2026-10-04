"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { API_URL, keys } from "./api";
import type { HorizonEvent, Job, JobDetail, Run, RunDetail, Step, StepPayload } from "@/types/api";

type Handler = (event: HorizonEvent) => void;

/* One EventSource per URL; handlers live in a ref so changing them never reconnects. */
export function useEventSource(url: string | null, handlers: Record<string, Handler>) {
  const ref = useRef(handlers);
  const [connected, setConnected] = useState(false);

  // Latest-handlers ref, updated after every render (declared first so it runs first).
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    if (!url) return;
    const source = new EventSource(url);
    const names = Object.keys(ref.current);
    const listener = (e: MessageEvent) => {
      const parsed = JSON.parse(e.data) as HorizonEvent;
      ref.current[parsed.type]?.(parsed);
      ref.current["*"]?.(parsed);
    };
    for (const name of names) if (name !== "*") source.addEventListener(name, listener);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    return () => {
      source.close();
      setConnected(false);
    };
  }, [url]);

  return connected;
}

const JOB_EVENTS = [
  "job.started",
  "job.progress",
  "job.finished",
  "job.cancelled",
  "job.failed",
  "run.started",
  "run.graded",
  "run.failed",
  "run.cancelled",
] as const;

/* Keeps the job detail query in sync while a job is running. */
export function useJobEvents(jobId: string | null, active: boolean) {
  const qc = useQueryClient();
  const url = jobId && active ? `${API_URL}/api/jobs/${jobId}/events?replay=false` : null;

  const patchRun = (run: Run) =>
    qc.setQueryData<JobDetail>(keys.job(run.job_id), (old) => {
      if (!old) return old;
      const runs = old.runs.some((r) => r.id === run.id)
        ? old.runs.map((r) => (r.id === run.id ? run : r))
        : [...old.runs, run];
      const done = runs.filter((r) => ["completed", "error", "cancelled"].includes(r.status));
      return { ...old, runs, runs_total: runs.length, runs_done: done.length };
    });

  const patchJob = (job: Partial<Job> & { id: string }) =>
    qc.setQueryData<JobDetail>(keys.job(job.id), (old) => (old ? { ...old, ...job } : old));

  const handlers: Record<string, Handler> = {};
  for (const name of JOB_EVENTS) {
    handlers[name] = (event) => {
      if (name === "run.started") {
        qc.invalidateQueries({ queryKey: keys.job(event.job_id) });
      } else if (name.startsWith("run.")) {
        if (event.data) patchRun(event.data as Run);
      } else if (name === "job.progress") {
        const data = event.data as { summary?: JobDetail["summary"] };
        if (data?.summary) patchJob({ id: event.job_id, summary: data.summary });
      } else {
        patchJob(event.data as Job);
        qc.invalidateQueries({ queryKey: ["jobs"] });
      }
    };
  }
  return useEventSource(url, handlers);
}

/* Appends live steps to a run detail query while that run is in flight. */
export function useRunEvents(run: Run | undefined, active: boolean) {
  const qc = useQueryClient();
  const url =
    run && active ? `${API_URL}/api/jobs/${run.job_id}/events?replay=false` : null;

  return useEventSource(url, {
    step: (event) => {
      if (event.run_id !== run?.id) return;
      const data = event.data as StepPayload & { seq: number };
      qc.setQueryData<RunDetail>(keys.run(run.id), (old) => {
        if (!old || old.steps.some((s) => s.seq === data.seq)) return old;
        const { seq, ...payload } = data;
        const step: Step = {
          id: -1 - seq,
          run_id: run.id,
          seq,
          source: payload.source,
          payload,
          started_at: payload.started_at ?? null,
          ended_at: payload.ended_at ?? null,
        };
        return { ...old, steps: [...old.steps, step].sort((a, b) => a.seq - b.seq) };
      });
    },
    "run.graded": (event) => {
      if (event.run_id === run?.id) qc.invalidateQueries({ queryKey: keys.run(run.id) });
    },
    "run.failed": (event) => {
      if (event.run_id === run?.id) qc.invalidateQueries({ queryKey: keys.run(run.id) });
    },
    "run.cancelled": (event) => {
      if (event.run_id === run?.id) qc.invalidateQueries({ queryKey: keys.run(run.id) });
    },
  });
}

/* A rolling feed of everything happening across jobs, for the overview page. */
export function useActivityFeed(limit = 40) {
  const [events, setEvents] = useState<HorizonEvent[]>([]);
  const qc = useQueryClient();
  const connected = useEventSource(`${API_URL}/api/events`, {
    "*": (event) => {
      if (event.type === "step") return; // too chatty for a feed
      setEvents((prev) => [event, ...prev].slice(0, limit));
      if (event.type.startsWith("job.")) qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    "job.started": () => {},
    "job.progress": () => {},
    "job.finished": () => {},
    "job.cancelled": () => {},
    "job.failed": () => {},
    "run.started": () => {},
    "run.graded": () => {},
    "run.failed": () => {},
    "run.cancelled": () => {},
  });
  return { events, connected };
}
