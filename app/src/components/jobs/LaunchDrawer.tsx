"use client";

import { Rocket } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/primitives/Button";
import { Drawer } from "@/components/primitives/Drawer";
import { Combobox } from "@/components/primitives/Combobox";
import { Field, Input, Row } from "@/components/primitives/Field";
import { Select } from "@/components/primitives/Select";
import { ApiError } from "@/lib/api";
import { fmtArgs } from "@/lib/format";
import { envItems } from "@/lib/envs";
import { useCreateJob, useEnvs, useJobs, useProviders } from "@/lib/queries";
import type { AgentType, JobCreate } from "@/types/api";

import styles from "./LaunchDrawer.module.css";

type LaunchDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultEnvId?: string;
};

export function LaunchDrawer({ open, onOpenChange, defaultEnvId }: LaunchDrawerProps) {
  const router = useRouter();
  const { data: envs = [] } = useEnvs();
  const { data: providers = [] } = useProviders();
  const { data: jobs = [] } = useJobs({ limit: 200 });
  const create = useCreateJob();

  // User choices are stored as overrides; the effective values fall back to sensible defaults so
  // nothing needs syncing when the data arrives.
  const [envChoice, setEnvChoice] = useState<string | null>(null);
  const [agentChoice, setAgentChoice] = useState<AgentType | null>(null);
  const [modelChoice, setModelChoice] = useState<string | null>(null);
  const [groupSize, setGroupSize] = useState(1);
  const [maxSteps, setMaxSteps] = useState(10);
  const [maxConcurrent, setMaxConcurrent] = useState(4);
  const [baseUrl, setBaseUrl] = useState("http://localhost:11434/v1");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const env =
    envs.find((e) => e.id === envChoice) ?? envs.find((e) => e.id === defaultEnvId) ?? envs[0];
  const provider =
    providers.find((p) => p.agent_type === agentChoice) ??
    providers.find((p) => p.available) ??
    providers[0];
  const agentType: AgentType = provider?.agent_type ?? "gemini";
  const model = modelChoice ?? provider?.default_model ?? "";

  const allTasks = useMemo(() => env?.tasks ?? [], [env]);
  const taskIds = useMemo(
    () => (selected.size ? allTasks.filter((t) => selected.has(t.slug)).map((t) => t.slug) : null),
    [selected, allTasks],
  );
  const runCount = (taskIds?.length ?? allTasks.length) * groupSize;

  const pickProvider = (type: AgentType) => {
    setAgentChoice(type);
    setModelChoice(null); // fall back to that provider's default model
  };

  const submit = async () => {
    if (!env) return;
    const body: JobCreate = {
      env_id: env.id,
      agent_type: agentType,
      model: model.trim(),
      group_size: groupSize,
      max_steps: maxSteps,
      max_concurrent: maxConcurrent,
      task_ids: taskIds,
      agent_config: agentType === "openai_compatible" ? { base_url: baseUrl } : {},
    };
    const job = await create.mutateAsync(body);
    onOpenChange(false);
    router.push(`/jobs/${job.id}`);
  };

  const error =
    create.error instanceof ApiError
      ? String(create.error.detail)
      : create.error
        ? String(create.error)
        : null;

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="New run"
      description="Every task in the environment, attempted group-size times."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<Rocket size={14} />}
            loading={create.isPending}
            disabled={!env || !model.trim() || runCount === 0}
            onClick={submit}
          >
            Launch {runCount} run{runCount === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      <Field label="Environment" htmlFor="launch-env">
        <Combobox
          id="launch-env"
          value={env?.id ?? ""}
          onChange={(v) => {
            setEnvChoice(v);
            setSelected(new Set());
          }}
          items={envItems(envs, jobs)}
          placeholder="Choose an environment"
          searchPlaceholder="Search environments…"
          width="100%"
        />
      </Field>

      <Row>
        <Field label="Provider" htmlFor="launch-provider">
          <Select
            id="launch-provider"
            value={agentType}
            onChange={(v) => pickProvider(v as AgentType)}
            width="100%"
            options={providers.map((p) => ({
              value: p.agent_type,
              label: p.label,
              hint: !p.available
                ? "no key: add one in Settings"
                : p.via === "hud_gateway"
                  ? "via HUD gateway"
                  : undefined,
              disabled: !p.available,
            }))}
          />
        </Field>
        <Field
          label="Model"
          htmlFor="launch-model"
          hint={
            provider?.via === "hud_gateway"
              ? "No provider key: calls route through HUD's gateway and bill HUD credits."
              : undefined
          }
        >
          <Input
            id="launch-model"
            list="launch-models"
            value={model}
            onChange={(e) => setModelChoice(e.target.value)}
            placeholder={provider?.default_model}
          />
          <datalist id="launch-models">
            {(provider?.models ?? []).map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>
      </Row>

      {agentType === "openai_compatible" && (
        <Field label="Base URL" htmlFor="launch-base-url" hint="Any OpenAI-compatible server.">
          <Input id="launch-base-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </Field>
      )}

      <Row>
        <Field label="Group size" htmlFor="launch-group" hint="Attempts per task">
          <Input
            id="launch-group"
            type="number"
            min={1}
            max={64}
            value={groupSize}
            onChange={(e) => setGroupSize(Math.max(1, Number(e.target.value) || 1))}
          />
        </Field>
        <Field label="Max steps" htmlFor="launch-steps">
          <Input
            id="launch-steps"
            type="number"
            min={1}
            max={500}
            value={maxSteps}
            onChange={(e) => setMaxSteps(Math.max(1, Number(e.target.value) || 1))}
          />
        </Field>
        <Field label="Concurrency" htmlFor="launch-concurrency">
          <Input
            id="launch-concurrency"
            type="number"
            min={1}
            max={64}
            value={maxConcurrent}
            onChange={(e) => setMaxConcurrent(Math.max(1, Number(e.target.value) || 1))}
          />
        </Field>
      </Row>

      <div className={styles.tasks}>
        <div className={styles.tasksHead}>
          <span className={styles.label}>Tasks</span>
          <button type="button" className={styles.link} onClick={() => setSelected(new Set())}>
            {selected.size ? "Select all" : "All selected"}
          </button>
        </div>
        <ul className={styles.taskList}>
          {allTasks.map((t) => {
            const checked = selected.size === 0 || selected.has(t.slug);
            return (
              <li key={t.slug}>
                <label className={styles.task}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = new Set(selected.size ? selected : allTasks.map((x) => x.slug));
                      if (e.target.checked) next.add(t.slug);
                      else next.delete(t.slug);
                      setSelected(next.size === allTasks.length ? new Set() : next);
                    }}
                  />
                  <span className={styles.taskId}>{t.id}</span>
                  <span className={styles.taskArgs}>{fmtArgs(t.args)}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      {error && <div className={styles.error}>{error}</div>}
    </Drawer>
  );
}
