import type {
  CompareResult,
  Env,
  Job,
  JobAnalytics,
  JobCreate,
  JobDetail,
  ProbeReport,
  Provider,
  ProviderKey,
  Run,
  RunDetail,
} from "@/types/api";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: unknown,
  ) {
    super(typeof detail === "string" ? detail : `Request failed (${status})`);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const json = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export const api = {
  health: () => request<{ status: string; hud: string }>("/health"),
  providers: () => request<Provider[]>("/providers"),
  keys: {
    list: () => request<ProviderKey[]>("/settings/keys"),
    save: (provider: string, value: string) =>
      request<ProviderKey>(`/settings/keys/${provider}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      }),
    remove: (provider: string) =>
      request<ProviderKey>(`/settings/keys/${provider}`, { method: "DELETE" }),
  },
  envs: {
    list: () => request<Env[]>("/envs"),
    get: (id: string) => request<Env>(`/envs/${id}`),
    register: (path: string) => request<Env>("/envs", json({ path })),
    reload: (id: string) => request<Env>(`/envs/${id}/reload`, { method: "POST" }),
    remove: (id: string) => request<void>(`/envs/${id}`, { method: "DELETE" }),
  },
  jobs: {
    list: (params: { status?: string; env_id?: string; limit?: number } = {}) => {
      const q = new URLSearchParams();
      if (params.status) q.set("status", params.status);
      if (params.env_id) q.set("env_id", params.env_id);
      if (params.limit) q.set("limit", String(params.limit));
      const qs = q.toString();
      return request<Job[]>(`/jobs${qs ? `?${qs}` : ""}`);
    },
    get: (id: string) => request<JobDetail>(`/jobs/${id}`),
    analytics: (id: string, bins: number) =>
      request<JobAnalytics>(`/jobs/${id}/analytics?bins=${bins}`),
    create: (body: JobCreate) => request<Job>("/jobs", json(body)),
    cancel: (id: string) => request<Job>(`/jobs/${id}/cancel`, { method: "POST" }),
    rerun: (id: string) => request<Job>(`/jobs/${id}/rerun`, { method: "POST" }),
    remove: (id: string) => request<void>(`/jobs/${id}`, { method: "DELETE" }),
  },
  runs: {
    get: (id: string) => request<RunDetail>(`/runs/${id}`),
    setExcluded: (id: string, excluded: boolean) =>
      request<Run>(`/runs/${id}`, { method: "PATCH", body: JSON.stringify({ excluded }) }),
  },
  probes: {
    get: (envId: string) => request<ProbeReport>(`/envs/${envId}/probes`),
    run: (envId: string, taskIds?: string[] | null) =>
      request<ProbeReport>(`/envs/${envId}/probes`, json({ task_ids: taskIds ?? null })),
  },
  compare: (jobIds: string[]) =>
    request<CompareResult>(`/compare?jobs=${encodeURIComponent(jobIds.join(","))}`),
};

export const keys = {
  health: ["health"] as const,
  providers: ["providers"] as const,
  keys: ["keys"] as const,
  envs: ["envs"] as const,
  env: (id: string) => ["envs", id] as const,
  jobs: (params: Record<string, string | number | undefined> = {}) => ["jobs", params] as const,
  job: (id: string) => ["jobs", id] as const,
  analytics: (id: string, bins: number) => ["jobs", id, "analytics", bins] as const,
  run: (id: string) => ["runs", id] as const,
  probes: (envId: string) => ["envs", envId, "probes"] as const,
  compare: (ids: string[]) => ["compare", ...ids] as const,
};
