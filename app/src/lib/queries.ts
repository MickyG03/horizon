"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, keys } from "./api";
import type { JobCreate } from "@/types/api";

export const useHealth = () =>
  useQuery({ queryKey: keys.health, queryFn: api.health, retry: false, refetchInterval: 15_000 });

export const useProviders = () =>
  useQuery({ queryKey: keys.providers, queryFn: api.providers, staleTime: 60_000 });

export const useEnvs = () => useQuery({ queryKey: keys.envs, queryFn: api.envs.list });

export const useEnv = (id: string) =>
  useQuery({ queryKey: keys.env(id), queryFn: () => api.envs.get(id) });

export const useJobs = (params: { status?: string; env_id?: string; limit?: number } = {}) =>
  useQuery({
    queryKey: keys.jobs(params),
    queryFn: () => api.jobs.list(params),
    // Running jobs change constantly; events patch the cache, this is the safety net.
    refetchInterval: (query) =>
      query.state.data?.some((j) => j.status === "running" || j.status === "queued")
        ? 5_000
        : false,
  });

export const useJob = (id: string) =>
  useQuery({ queryKey: keys.job(id), queryFn: () => api.jobs.get(id) });

export const useRun = (id: string) =>
  useQuery({ queryKey: keys.run(id), queryFn: () => api.runs.get(id) });

export function useRegisterEnv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => api.envs.register(path),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.envs }),
  });
}

export function useReloadEnv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.envs.reload(id),
    onSuccess: (env) => {
      qc.setQueryData(keys.env(env.id), env);
      qc.invalidateQueries({ queryKey: keys.envs });
    },
  });
}

export function useDeleteEnv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.envs.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.envs }),
  });
}

export function useCreateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: JobCreate) => api.jobs.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });
}

export function useCancelJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.jobs.cancel(id),
    onSuccess: (job) => {
      qc.invalidateQueries({ queryKey: keys.job(job.id) });
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

export function useRerunJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.jobs.rerun(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });
}

export function useDeleteJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.jobs.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });
}

export function useSetRunExcluded() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, excluded }: { id: string; excluded: boolean }) =>
      api.runs.setExcluded(id, excluded),
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: keys.run(run.id) });
      qc.invalidateQueries({ queryKey: keys.job(run.job_id) });
    },
  });
}
