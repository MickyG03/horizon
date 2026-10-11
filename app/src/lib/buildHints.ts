/* Telling a slow build step from a stuck one: when a running step is well past how long it
   usually takes, say so, and say why where the log makes it clear. */

import { fmtElapsed } from "@/lib/format";
import type { BuildStep } from "@/types/api";

type StepKey = BuildStep["key"];

/* With no history for this template yet, how long before a step counts as slow. */
const FALLBACK_S: Record<StepKey, number> = {
  fetch: 30,
  configure: 10,
  install: 180,
  image: 600,
  register: 60,
  verify: 120,
};

const BIG_DOWNLOAD_MIB = 100;
const UNIT_MIB: Record<string, number> = { K: 1 / 1024, M: 1, G: 1024 };
const TAIL_LINES = 400;

export interface SlowHint {
  title: string;
  reason: string;
  lastLine: string | null;
}

/* Slow means twice the usual and at least 20s over it, so short steps don't flag on noise. */
export function slowAfter(key: StepKey, typical: number | undefined): number {
  return typical ? Math.max(typical * 2, typical + 20) : FALLBACK_S[key];
}

export function slowStepHint(
  step: BuildStep,
  elapsed: number | null,
  typical: number | undefined,
  log: string,
): SlowHint | null {
  if (step.status !== "running" || elapsed === null) return null;
  if (elapsed < slowAfter(step.key, typical)) return null;
  const lines = log.split("\n").slice(-TAIL_LINES);
  const lastLine =
    lines
      .map((l) => l.trim())
      .filter(Boolean)
      .at(-1) ?? null;
  return {
    title: typical ? `Slower than usual (usually ${fmtElapsed(typical)})` : "Taking a while",
    reason: REASONS[step.key](lines),
    lastLine,
  };
}

const REASONS: Record<StepKey, (lines: string[]) => string> = {
  fetch: () => "The GitHub download is slow. If you're rate-limited, set GITHUB_TOKEN.",
  configure: () => "Writing config shouldn't take this long; check the log.",
  install: installReason,
  image: imageReason,
  register: () => "Loading tasks imports the environment; heavy imports take a while.",
  verify: () => "Every task runs once with a scripted agent; slow tasks or graders add up.",
};

/* uv prints "Downloading torch (873.2MiB)" when it starts a big wheel, "Downloaded torch" when
   done, and "Building pkg" while it compiles one from source. */
function installReason(lines: string[]): string {
  const started = new Map<string, number>();
  const finished = new Set<string>();
  let building: string | null = null;
  for (const line of lines) {
    const dl = line.match(/^\s*Downloading (\S+) \(([\d.]+)\s*([KMG])iB\)/);
    if (dl) started.set(dl[1], Number(dl[2]) * UNIT_MIB[dl[3]]);
    const done = line.match(/^\s*Downloaded (\S+)/);
    if (done) finished.add(done[1]);
    const build = line.match(/^\s*Building (\S+)/);
    if (build) building = build[1];
    const built = line.match(/^\s*Built (\S+)/);
    if (built && built[1] === building) building = null;
  }
  const big = [...started]
    .filter(([name, mib]) => mib >= BIG_DOWNLOAD_MIB && !finished.has(name))
    .sort((a, b) => b[1] - a[1]);
  if (big.length > 0) {
    const named = big.slice(0, 2).map(([name, mib]) => `${name} (${fmtSize(mib)})`);
    const more = big.length > 2 ? ` and ${big.length - 2} more` : "";
    return `Downloading large packages: ${named.join(", ")}${more}.`;
  }
  if (building) return `Compiling ${building} from source.`;
  return "Resolving and installing dependencies; the first install on a cold uv cache is slowest.";
}

/* BuildKit prints "#7 [3/8] RUN apt-get install ..." for each Dockerfile step. */
function imageReason(lines: string[]): string {
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/\[(?:\S+\s+)?(\d+)\/(\d+)\]\s+(.+)/);
    if (m) return `Docker is on step ${m[1]} of ${m[2]}: ${truncate(m[3], 80)}`;
  }
  return "First Docker builds pull base images and are the slowest.";
}

function fmtSize(mib: number): string {
  return mib >= 1024 ? `${(mib / 1024).toFixed(1)} GiB` : `${Math.round(mib)} MiB`;
}

function truncate(text: string, n: number): string {
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
}
