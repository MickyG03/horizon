import type { Step, StepPayload } from "@/types/api";

export function promptText(payload: StepPayload): string {
  const parts = (payload.messages ?? []).map((m) =>
    typeof m.content === "string" ? m.content : (m.content?.text ?? ""),
  );
  return parts.filter(Boolean).join("\n");
}

export function setupPrompt(payload: StepPayload): string | null {
  const result = payload.task_call?.result;
  if (result && typeof result === "object" && "prompt" in result) {
    const p = (result as { prompt?: unknown }).prompt;
    return typeof p === "string" ? p : null;
  }
  return null;
}

export function evaluateScore(payload: StepPayload): number | null {
  const result = payload.task_call?.result;
  if (result && typeof result === "object" && "score" in result) {
    const s = (result as { score?: unknown }).score;
    return typeof s === "number" ? s : null;
  }
  return null;
}

export function toolResultText(payload: StepPayload): string {
  const content = payload.result?.content;
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === "string" ? c : typeof c?.text === "string" ? c.text : JSON.stringify(c)))
      .join("\n");
  }
  return JSON.stringify(content, null, 2);
}

export function stepDuration(step: Step): number | null {
  const a = step.started_at ?? step.payload.started_at;
  const b = step.ended_at ?? step.payload.ended_at;
  if (!a || !b) return null;
  return (new Date(b).getTime() - new Date(a).getTime()) / 1000;
}

export function pretty(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
