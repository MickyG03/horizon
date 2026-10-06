"use client";

import { Bot, CheckCircle2, Cog, Cpu, MessageSquare, TriangleAlert, Wrench } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

import { Badge } from "@/components/primitives/Badge";
import { DUR, EASE } from "@theme/motion";
import { fmtArgs, fmtDuration, fmtReward, fmtTokens } from "@/lib/format";
import type { Run, Step } from "@/types/api";

import { evaluateScore, pretty, promptText, setupPrompt, stepDuration, toolResultText } from "./stepText";
import styles from "./Timeline.module.css";

export function Timeline({ steps, run }: { steps: Step[]; run: Run }) {
  const live = run.status === "running" || run.status === "pending";
  return (
    <ol className={styles.timeline}>
      <AnimatePresence initial={false}>
        {steps.map((step) => (
          <motion.li
            key={step.seq}
            className={styles.item}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR.base, ease: EASE.out }}
          >
            <StepCard step={step} />
          </motion.li>
        ))}
      </AnimatePresence>
      {live && (
        <li className={`${styles.item} ${styles.waiting}`}>
          <span className={styles.dot} data-kind="running" />
          <div className={styles.waitingText}>waiting for the next step…</div>
        </li>
      )}
    </ol>
  );
}

function StepCard({ step }: { step: Step }) {
  const p = step.payload;
  const duration = stepDuration(step);

  if (p.source === "task" && p.task_call?.phase === "setup") {
    const prompt = setupPrompt(p);
    return (
      <Frame kind="task" icon={<Cog size={14} />} title={`Setup · ${p.task_call.name}`} duration={duration}>
        {p.task_call.arguments && typeof p.task_call.arguments === "object" ? (
          <div className={styles.kv}>{fmtArgs(p.task_call.arguments as Record<string, unknown>)}</div>
        ) : null}
        {prompt ? <p className={styles.muted}>Prompt prepared.</p> : null}
      </Frame>
    );
  }

  if (p.source === "task" && p.task_call?.phase === "evaluate") {
    const score = evaluateScore(p);
    const args = p.task_call.arguments as { answer?: unknown } | undefined;
    return (
      <Frame
        kind="grade"
        icon={<CheckCircle2 size={14} />}
        title="Graded"
        duration={duration}
        trailing={
          <span className={styles.score} data-pass={score != null && score >= 1 ? "" : undefined}>
            {score == null ? "—" : fmtReward(score)}
          </span>
        }
      >
        {args?.answer != null && (
          <div className={styles.kv}>
            answer = <code>{pretty(args.answer)}</code>
          </div>
        )}
        {p.error && <pre className={styles.error}>{p.error}</pre>}
      </Frame>
    );
  }

  if (p.source === "user") {
    return (
      <Frame kind="user" icon={<MessageSquare size={14} />} title="Prompt" duration={duration}>
        <p className={styles.prompt}>{promptText(p)}</p>
      </Frame>
    );
  }

  if (p.source === "agent") {
    const usage = p.usage ?? {};
    return (
      <Frame
        kind="agent"
        icon={<Bot size={14} />}
        title={p.model ?? "Agent"}
        duration={duration}
        trailing={
          usage.prompt_tokens != null && (
            <span className={styles.usage}>
              {fmtTokens(usage.prompt_tokens)} in · {fmtTokens(usage.completion_tokens ?? 0)} out
            </span>
          )
        }
      >
        {p.reasoning && (
          <details className={styles.reasoning}>
            <summary>Reasoning</summary>
            <pre className={styles.reasoningText}>{p.reasoning}</pre>
          </details>
        )}
        {p.content && <p className={styles.content}>{p.content}</p>}
        {p.tool_calls && p.tool_calls.length > 0 && (
          <ul className={styles.calls}>
            {p.tool_calls.map((call, i) => (
              <li key={call.id ?? i} className={styles.call}>
                <Wrench size={12} />
                <code>{call.name}</code>
                {call.arguments != null && (
                  <details className={styles.args}>
                    <summary>arguments</summary>
                    <pre>{pretty(call.arguments)}</pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
        {p.error && <pre className={styles.error}>{p.error}</pre>}
        {p.finish_reason && (
          <div className={styles.finish}>
            finish: <code>{p.finish_reason}</code>
            {p.done && " · done"}
          </div>
        )}
      </Frame>
    );
  }

  if (p.source === "tool") {
    const text = toolResultText(p);
    const isError = Boolean(p.result?.isError);
    return (
      <Frame
        kind={isError ? "error" : "tool"}
        icon={<Cpu size={14} />}
        title={p.call?.name ?? "Tool"}
        duration={duration}
        trailing={isError && <Badge color="var(--status-error)">tool error</Badge>}
      >
        {p.call?.arguments != null && (
          <details className={styles.args}>
            <summary>arguments</summary>
            <pre>{pretty(p.call.arguments)}</pre>
          </details>
        )}
        {text && <pre className={styles.toolResult}>{text}</pre>}
      </Frame>
    );
  }

  if (p.source === "system") {
    return (
      <Frame kind="error" icon={<TriangleAlert size={14} />} title="System" duration={duration}>
        <pre className={styles.error}>{p.error ?? pretty(p)}</pre>
      </Frame>
    );
  }

  return (
    <Frame kind="tool" icon={<Cpu size={14} />} title={p.source} duration={duration}>
      <pre className={styles.toolResult}>{pretty(p)}</pre>
    </Frame>
  );
}

function Frame({
  kind,
  icon,
  title,
  duration,
  trailing,
  children,
}: {
  kind: "task" | "grade" | "user" | "agent" | "tool" | "error";
  icon: ReactNode;
  title: ReactNode;
  duration: number | null;
  trailing?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      <span className={styles.dot} data-kind={kind} />
      <div className={`surface ${styles.card}`} data-kind={kind}>
        <header className={styles.head}>
          <span className={styles.icon}>{icon}</span>
          <span className={styles.title}>{title}</span>
          <span className={styles.spacer} />
          {trailing}
          {duration != null && <span className={styles.duration}>{fmtDuration(duration)}</span>}
        </header>
        {children && <div className={styles.body}>{children}</div>}
      </div>
    </>
  );
}
