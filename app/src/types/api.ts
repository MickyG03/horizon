/* Mirrors server/schemas and server/db/models. Keep in sync by hand; the shapes are small. */

export type JobStatus = "queued" | "running" | "finished" | "cancelled" | "failed";
export type RunStatus = "pending" | "running" | "completed" | "error" | "cancelled";
export type CauseKind = "ok" | "agent" | "infra" | "env" | "grader";
export type AgentType = "claude" | "openai" | "gemini" | "openai_compatible" | "scripted";
export type StepSource = "user" | "agent" | "tool" | "task" | "system" | "subagent";

export interface TaskParam {
  required: boolean;
  default: unknown;
  type: string | null;
}

export interface TaskMeta {
  id: string;
  slug: string;
  env: string;
  args: Record<string, unknown>;
  description: string;
  params: Record<string, TaskParam>;
}

export interface Env {
  id: string;
  name: string;
  taskset_name: string;
  path: string;
  task_count: number;
  tasks: TaskMeta[];
  registered_at: string;
  last_loaded_at: string | null;
  load_error: string | null;
  probe_score: number | null;
}

export interface JobSummary {
  n: number;
  done: number;
  graded: number;
  valid_n: number;
  raw_reward: number | null;
  valid_reward: number | null;
  infra_failures: number;
  by_cause: Record<string, number>;
  by_kind: Partial<Record<CauseKind, number>>;
  tokens: { prompt: number; completion: number; total: number };
  duration_s: { mean: number | null; max: number | null; total: number | null };
}

export interface Job {
  id: string;
  env_id: string;
  env_name: string | null;
  name: string;
  agent_type: AgentType;
  model: string;
  group_size: number;
  max_steps: number;
  max_concurrent: number;
  agent_config: Record<string, unknown>;
  task_filter: string[] | null;
  status: JobStatus;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  summary: Partial<JobSummary>;
  runs_total: number;
  runs_done: number;
}

export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  cached_tokens?: number;
  llm_calls?: number;
}

export interface Run {
  id: string;
  job_id: string;
  task_id: string;
  slug: string;
  args: Record<string, unknown>;
  group_id: string | null;
  attempt: number;
  status: RunStatus;
  reward: number | null;
  answer: string | null;
  stop_reason: string | null;
  error: string | null;
  cause: string | null;
  cause_kind: CauseKind | null;
  excluded: boolean;
  started_at: string | null;
  ended_at: string | null;
  usage: Usage;
}

export interface JobDetail extends Job {
  runs: Run[];
}

/* One recorded hud Step, as `Step.model_dump(mode="json", exclude_none=True)`. AgentStep and
   ToolStep add fields on top of the base; everything optional because sources differ. */
export interface ToolCall {
  id?: string;
  name: string;
  arguments?: unknown;
  provider_name?: string | null;
}

export interface ToolResult {
  content?: unknown;
  structuredContent?: unknown;
  isError?: boolean;
  call_id?: string | null;
}

export interface PromptMessage {
  role: string;
  content: { type: string; text?: string } | string;
}

export interface StepPayload {
  step_id?: number;
  source: StepSource;
  messages?: PromptMessage[];
  task_call?: {
    phase: "setup" | "evaluate";
    name: string;
    arguments?: unknown;
    result?: unknown;
  };
  error?: string | null;
  started_at?: string;
  ended_at?: string;
  extra?: Record<string, unknown>;
  // AgentStep
  content?: string | null;
  reasoning?: string | null;
  tool_calls?: ToolCall[];
  done?: boolean;
  finish_reason?: string | null;
  stop_reason?: string | null;
  model?: string | null;
  usage?: Usage | null;
  // ToolStep
  call?: ToolCall;
  result?: ToolResult;
}

export interface Step {
  id: number;
  run_id: string;
  seq: number;
  source: StepSource;
  payload: StepPayload;
  started_at: string | null;
  ended_at: string | null;
}

export interface RunDetail {
  run: Run;
  steps: Step[];
  job: Job;
}

export interface Provider {
  agent_type: AgentType;
  label: string;
  key_env: string | null;
  default_model: string;
  models: string[];
  available: boolean;
  via: "provider_key" | "hud_gateway" | "base_url" | null;
}

export interface JobCreate {
  env_id: string;
  agent_type: AgentType;
  model: string;
  name?: string;
  group_size?: number;
  max_steps?: number;
  max_concurrent?: number;
  task_ids?: string[] | null;
  agent_config?: Record<string, unknown>;
}

/* Analytics (server/services/analytics.py) */
export interface HistogramBin {
  lo: number;
  hi: number;
  count: number;
}

export interface Histogram {
  bins: HistogramBin[];
  n: number;
  valid_only: boolean;
}

export type SignalClass = "learnable" | "saturated" | "impossible" | "flat" | "unknown";

export interface SignalAttempt {
  run_id: string;
  attempt: number;
  status: RunStatus;
  reward: number | null;
  cause: string | null;
  cause_kind: CauseKind | null;
  excluded: boolean;
  counted: boolean;
  advantage: number | null;
}

export interface TaskSignal {
  slug: string;
  task_id: string;
  args: Record<string, unknown>;
  attempts_total: number;
  excluded: number;
  n: number;
  mean: number | null;
  std: number | null;
  variance: number | null;
  pass_rate: number | null;
  signal: SignalClass;
  signal_strength: number | null;
  attempts: SignalAttempt[];
}

export interface SignalSummary {
  tasks: number;
  learnable: number;
  saturated: number;
  impossible: number;
  flat: number;
  unknown: number;
  zero_gradient_fraction: number | null;
  mean_variance: number | null;
  max_group: number;
}

export interface JobAnalytics {
  summary: JobSummary;
  histogram: Histogram;
  histogram_valid: Histogram;
  signal: SignalSummary;
  tasks: TaskSignal[];
}

/* Grader probes (server/services/probes.py) */
export interface ProbeOutcome {
  probe: string;
  reward: number | null;
  accepted: boolean;
  error: string | null;
  description: string;
}

export interface ProbeTask {
  slug: string;
  task_id: string;
  score: number | null;
  accepted: { probe: string; answer: string; reward: number | null; description: string }[];
  errors: { probe: string; error: string | null }[];
  probes: ProbeOutcome[];
  ran_at: string;
}

export interface ProbeReport {
  score: number | null;
  probe_count: number;
  catalogue: { probe: string; description: string }[];
  tasks: ProbeTask[];
}

/* Compare (server/api/analytics.py) */
export interface CompareCell {
  pass_rate: number | null;
  mean: number | null;
  n: number;
  signal: SignalClass;
}

export interface CompareResult {
  env: { id: string; name: string } | null;
  columns: {
    job_id: string;
    name: string;
    model: string;
    agent_type: AgentType;
    status: JobStatus;
    summary: Partial<JobSummary>;
    created_at: string;
  }[];
  rows: { slug: string; task_id: string; args: Record<string, unknown>; cells: Record<string, CompareCell> }[];
}

export interface HorizonEvent<T = unknown> {
  type: string;
  ts: string;
  job_id: string;
  run_id: string | null;
  data: T;
}
