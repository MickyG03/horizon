"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { api, keys } from "./api";
import type { BuildCreate, JobCreate } from "@/types/api";

export const useHealth = () =>
  useQuery({ queryKey: keys.health, queryFn: api.health, retry: false, refetchInterval: 15_000 });

export const useProviders = () =>
  useQuery({ queryKey: keys.providers, queryFn: api.providers, staleTime: 60_000 });

export const useKeys = () => useQuery({ queryKey: keys.keys, queryFn: api.keys.list });

export function useSaveKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ provider, value }: { provider: string; value: string }) =>
      api.keys.save(provider, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.keys });
      qc.invalidateQueries({ queryKey: keys.providers });
    },
  });
}

export function useRemoveKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider: string) => api.keys.remove(provider),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.keys });
      qc.invalidateQueries({ queryKey: keys.providers });
    },
  });
}

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

export const useJobAnalytics = (id: string, bins: number, live: boolean) =>
  useQuery({
    queryKey: keys.analytics(id, bins),
    queryFn: () => api.jobs.analytics(id, bins),
    refetchInterval: live ? 4_000 : false,
  });

export const useProbes = (envId: string) =>
  useQuery({ queryKey: keys.probes(envId), queryFn: () => api.probes.get(envId) });

export function useRunProbes(envId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskIds?: string[] | null) => api.probes.run(envId, taskIds),
    onSuccess: (report) => {
      qc.setQueryData(keys.probes(envId), report);
      qc.invalidateQueries({ queryKey: keys.env(envId) });
      qc.invalidateQueries({ queryKey: keys.envs });
    },
  });
}

export const useCompare = (ids: string[]) =>
  useQuery({
    queryKey: keys.compare(ids),
    queryFn: () => api.compare(ids),
    enabled: ids.length >= 1,
  });

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

export const useTemplates = () =>
  useQuery({ queryKey: keys.templates, queryFn: api.builder.templates });

export const useBuilderMachine = () =>
  useQuery({ queryKey: keys.machine, queryFn: api.builder.machine, staleTime: 30_000 });

export const useNameCheck = (name: string) =>
  useQuery({
    queryKey: keys.builderName(name),
    queryFn: () => api.builder.name(name),
    enabled: name.length > 0,
    staleTime: 5_000,
  });

export const useBuilds = () =>
  useQuery({
    queryKey: keys.builds,
    queryFn: api.builder.builds,
    refetchInterval: (query) =>
      query.state.data?.some((b) => b.status === "running") ? 2_000 : false,
  });

/* A build polls while it runs; when it lands, the env list and key status have changed. */
export function useBuild(id: string | null) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: keys.build(id ?? ""),
    queryFn: () => api.builder.build(id!),
    enabled: id !== null,
    refetchInterval: (q) => (q.state.data?.status === "running" ? 800 : false),
  });
  const status = query.data?.status;
  useEffect(() => {
    if (!status || status === "running") return;
    qc.invalidateQueries({ queryKey: keys.envs });
    qc.invalidateQueries({ queryKey: keys.keys });
    qc.invalidateQueries({ queryKey: keys.templates });
    qc.invalidateQueries({ queryKey: keys.builds });
  }, [qc, status]);
  return query;
}

export function useCreateBuild() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BuildCreate) => api.builder.create(body),
    onSuccess: (build) => {
      qc.setQueryData(keys.build(build.id), build);
      qc.invalidateQueries({ queryKey: keys.builds });
    },
  });
}

export function useRetryBuild() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; install?: boolean; build_image?: boolean }) =>
      api.builder.retry(id, body),
    onSuccess: (build) => qc.setQueryData(keys.build(build.id), build),
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
