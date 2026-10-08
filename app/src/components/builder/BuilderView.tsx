"use client";

import {
  Bot,
  Check,
  Code2,
  Cpu,
  ExternalLink,
  FileText,
  Globe,
  Hammer,
  Monitor,
  Search,
  Square,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type CSSProperties } from "react";

import { LED } from "@/components/horizon/LED";
import { Panel } from "@/components/horizon/Panel";
import { Badge } from "@/components/primitives/Badge";
import { Button } from "@/components/primitives/Button";
import { Field, Input } from "@/components/primitives/Field";
import { Switch } from "@/components/primitives/Switch";
import { PageHeader } from "@/components/shell/PageHeader";
import { ApiError } from "@/lib/api";
import { fmtRelative } from "@/lib/format";
import {
  useBuilderMachine,
  useBuilds,
  useCreateBuild,
  useNameCheck,
  useTemplates,
} from "@/lib/queries";
import type { BuilderMachine, EnvTemplate } from "@/types/api";

import { BuildProgress } from "./BuildProgress";
import { SecretInput } from "./SecretInput";
import styles from "./BuilderView.module.css";

const ICONS: Record<string, LucideIcon> = {
  blank: Square,
  coding: Code2,
  cua: Monitor,
  "argument-hints": FileText,
  browser: Globe,
  deepresearch: Search,
  worldsim: Bot,
  ml: Cpu,
};

/* Where a template runs, as this machine sees it. */
function runtimeBadge(t: EnvTemplate, machine?: BuilderMachine) {
  if (t.runtime === "local") return { label: "Runs here", color: "var(--status-success)" };
  if (t.runtime === "docker")
    return machine?.docker_ready
      ? { label: "Runs here in Docker", color: "var(--status-success)" }
      : { label: "Needs Docker", color: "var(--status-warn)" };
  return { label: "Runs on Modal", color: "var(--status-info)" };
}

export function BuilderView() {
  const router = useRouter();
  const params = useSearchParams();
  const buildId = params.get("build");
  const selected = params.get("template");
  const { data: templates } = useTemplates();
  const { data: machine } = useBuilderMachine();
  const { data: builds = [] } = useBuilds();
  const template = templates?.find((t) => t.id === selected) ?? null;

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow={
          <Link href="/envs" className={styles.crumb}>
            Environments
          </Link>
        }
        title="New environment"
        description="Pick a template. Horizon downloads it, wires up its keys, installs its dependencies into a venv of its own and loads its tasks, ready to run. No README to follow."
      />

      {buildId ? (
        <BuildProgress id={buildId} />
      ) : (
        <>
          <section className={styles.gallery} aria-label="Templates">
            {templates?.map((t, i) => (
              <TemplateCard
                key={t.id}
                template={t}
                machine={machine}
                index={i}
                selected={t.id === selected}
                onSelect={() => router.replace(`/envs/new?template=${t.id}`, { scroll: false })}
              />
            ))}
          </section>

          {template && (
            <Configure
              key={template.id}
              template={template}
              machine={machine}
              onStarted={(id) => router.push(`/envs/new?build=${id}`)}
            />
          )}

          {builds.length > 0 && (
            <Panel eyebrow="History" title="Recent builds" dense>
              <ul className={styles.builds}>
                {builds.slice(0, 8).map((b) => (
                  <li key={b.id}>
                    <Link href={`/envs/new?build=${b.id}`} className={styles.buildRow}>
                      <LED
                        color={
                          b.status === "succeeded"
                            ? "var(--status-success)"
                            : b.status === "failed"
                              ? "var(--status-error)"
                              : "var(--status-running)"
                        }
                        pulse={b.status === "running"}
                        size={7}
                      />
                      <span className={styles.buildName}>{b.name}</span>
                      <span className={styles.buildTemplate}>{b.template_name}</span>
                      <span className={styles.buildWhen}>{fmtRelative(b.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

function TemplateCard({
  template: t,
  machine,
  selected,
  onSelect,
  index,
}: {
  template: EnvTemplate;
  machine?: BuilderMachine;
  selected: boolean;
  onSelect: () => void;
  index: number;
}) {
  const Icon = ICONS[t.id] ?? Hammer;
  const runtime = runtimeBadge(t, machine);
  return (
    <button
      type="button"
      className={`surface surface-interactive rise ${styles.card}`}
      data-selected={selected || undefined}
      aria-pressed={selected}
      onClick={onSelect}
      style={{ "--i": index } as CSSProperties}
    >
      <span className={styles.cardHead}>
        <span className={styles.icon}>
          <Icon size={16} strokeWidth={1.9} aria-hidden />
        </span>
        {selected && (
          <span className={styles.check}>
            <Check size={13} strokeWidth={2.4} aria-hidden />
          </span>
        )}
      </span>
      <span className={styles.cardName}>{t.name}</span>
      <span className={styles.cardSummary}>{t.summary}</span>
      <span className={styles.cardFoot}>
        <Badge size="sm" color={runtime.color}>
          {runtime.label}
        </Badge>
        <span className={styles.cardTasks}>
          {t.sample_tasks.length} sample task{t.sample_tasks.length === 1 ? "" : "s"}
        </span>
      </span>
    </button>
  );
}

type MachineCheck = { label: string; ok: boolean | null; detail?: string };

function Configure({
  template: t,
  machine,
  onStarted,
}: {
  template: EnvTemplate;
  machine?: BuilderMachine;
  onStarted: (buildId: string) => void;
}) {
  const [name, setName] = useState(t.id);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [install, setInstall] = useState(t.install_default);
  const [buildImage, setBuildImage] = useState(true);
  const create = useCreateBuild();
  const check = useNameCheck(name);

  const nameProblem = !name
    ? "Give it a name."
    : check.data?.available === false
      ? check.data.problem
      : null;
  const missing = t.secrets.filter((s) => s.required && !s.present && !secrets[s.env]?.trim());
  const error =
    create.error instanceof ApiError ? String(create.error.detail) : create.error?.message;
  const dockerOk = machine?.docker_ready ?? false;

  const checks = useMemo(() => {
    const rows: MachineCheck[] = [
      {
        label: "uv",
        ok: machine ? Boolean(machine.uv) : null,
        detail: machine ? (machine.uv ?? "not found: docs.astral.sh/uv") : undefined,
      },
    ];
    for (const req of t.requirements) {
      if (req === "Docker") {
        rows.push({
          label: "Docker",
          ok: machine ? dockerOk : null,
          detail: machine?.docker_detail ?? undefined,
        });
      } else if (req === "git") {
        rows.push({
          label: "git",
          ok: machine ? Boolean(machine.git) : null,
          detail: machine ? (machine.git ?? "not found") : undefined,
        });
      } else {
        rows.push({ label: req, ok: null });
      }
    }
    return rows;
  }, [machine, t.requirements, dockerOk]);

  const submit = async () => {
    const build = await create.mutateAsync({
      template: t.id,
      name,
      secrets,
      install,
      build_image: t.runtime === "docker" ? buildImage && dockerOk : false,
    });
    onStarted(build.id);
  };

  return (
    <div className={styles.configure}>
      <Panel eyebrow={t.name} title="Set it up" index={0}>
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            if (!nameProblem) void submit();
          }}
        >
          <Field
            label="Name"
            htmlFor="env-name"
            error={name ? nameProblem : undefined}
            hint={
              <>
                Created at{" "}
                <code className={styles.code}>
                  {machine ? `${machine.envs_dir}/${name || "…"}` : "…"}
                </code>
              </>
            }
          >
            <Input
              id="env-name"
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
              spellCheck={false}
              autoComplete="off"
              className={styles.mono}
            />
          </Field>

          {t.secrets.length > 0 && (
            <fieldset className={styles.group}>
              <legend className={styles.legend}>Keys</legend>
              {t.secrets.map((s) => (
                <SecretInput
                  key={s.env}
                  secret={s}
                  value={secrets[s.env] ?? ""}
                  onChange={(v) => setSecrets((prev) => ({ ...prev, [s.env]: v }))}
                />
              ))}
            </fieldset>
          )}

          <fieldset className={styles.group}>
            <legend className={styles.legend}>Options</legend>
            <Switch
              checked={install}
              onChange={setInstall}
              label="Install dependencies"
              hint={
                t.install_note ??
                "uv sync into the env's own .venv, so its packages never touch Horizon's."
              }
            />
            {t.runtime === "docker" && (
              <Switch
                checked={buildImage && dockerOk}
                onChange={setBuildImage}
                disabled={!dockerOk}
                label="Build the Docker image"
                hint={
                  dockerOk
                    ? "docker build -f Dockerfile.hud. Every run starts a fresh container."
                    : `${machine?.docker_detail ?? "Docker not found."} Build it later with Retry.`
                }
              />
            )}
          </fieldset>

          {missing.length > 0 && (
            <p className={styles.warn}>
              Without {missing.map((s) => s.label).join(" and ")}, the tasks that need{" "}
              {missing.length === 1 ? "it" : "them"} will fail. You can still create the
              environment and add {missing.length === 1 ? "it" : "them"} to its .env later.
            </p>
          )}
          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.submit}>
            <Button
              type="submit"
              variant="primary"
              icon={<Hammer size={14} />}
              loading={create.isPending}
              disabled={Boolean(nameProblem) || check.isFetching}
            >
              Create environment
            </Button>
          </div>
        </form>
      </Panel>

      <Panel eyebrow="What you get" title={t.name} index={1}>
        <p className={styles.description}>{t.description}</p>

        <h3 className={styles.subhead}>Sample tasks</h3>
        <ul className={styles.tasks}>
          {t.sample_tasks.map((task) => (
            <li key={task}>{task}</li>
          ))}
        </ul>

        <h3 className={styles.subhead}>This machine</h3>
        <ul className={styles.checks}>
          {checks.map((c) => (
            <li key={c.label}>
              <LED
                size={7}
                color={
                  c.ok === null
                    ? "var(--status-info)"
                    : c.ok
                      ? "var(--status-success)"
                      : "var(--status-warn)"
                }
              />
              <span className={styles.checkLabel}>{c.label}</span>
              {c.detail && <span className={styles.checkDetail}>{c.detail}</span>}
            </li>
          ))}
        </ul>

        <a href={t.docs_url} target="_blank" rel="noreferrer" className={styles.source}>
          {t.repo}
          {t.subdir ? ` · ${t.subdir}` : ""} <ExternalLink size={11} />
        </a>
      </Panel>
    </div>
  );
}
