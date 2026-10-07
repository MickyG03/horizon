# Horizon

A local-first eval cockpit for [HUD](https://hud.ai) environments. Run any HUD tasks file against
any model from the browser, watch every step stream in, and get an honest read on the result:
which runs failed because the model was wrong, which because the grader is weak, and which because
a provider returned a 503.

![Overview: the valid-reward gauge rising over the horizon, with infra failure rate, jobs, runs and grader health below.](docs/screenshots/overview.jpg)

## Why

Running `hud eval` on a three-task environment produced a job that hud.ai reported as **67%,
FAILED**. The model had actually answered 2 of 2 correctly; the third run was a provider outage.
The SDK swallows that exception into a string on a system step and still grades the run with
`answer=None`, so it lands as a reward of 0 and drags the mean down. Nothing on the dashboard
distinguished "wrong answer" from "network error", nothing flagged that the task's grader accepts
`1 2 3` as a correct count, and nothing said whether any of the tasks carried training signal.

Horizon is the tool I wanted at that moment. It runs the same SDK, locally, and answers those
questions.

## What it does

**Runs evals locally, fully offline by default.** Register a tasks file by path; Horizon describes
it in a subprocess (user code never runs inside the server), then launches `tasks × group_size`
rollouts through `hud.eval.run.rollout`, one subprocess environment per run. Works with your own
Gemini, Anthropic or OpenAI key, or any OpenAI-compatible server such as Ollama. No trace leaves
your machine unless you turn sync on.

**Streams every step as it happens.** The SDK has no callback API, but every step of a rollout
passes through `Run.record`. Horizon wraps the agent so each step is persisted and pushed over SSE
the moment it is recorded: prompts, reasoning, tool calls, grades. Job and run pages update live.

**Triages every failure by cause.** Rate limited, provider unavailable, auth or credits, model not
found, timeout, environment error, grader error, ran out of steps, malformed tool call, wrong
answer, no answer. Causes that aren't the model's doing are set aside, and every job shows the
**valid reward** next to the **raw** one hud.ai would report.

![Job detail: every attempt was rate limited. The gauge stays empty and says why, where hud.ai would show 0%.](docs/screenshots/job-rate-limited.jpg)

![Job detail: valid reward gauge, score distribution and triage breakdown.](docs/screenshots/job.jpg)

**Probes graders for reward hacking.** Ten junk answers (an empty reply, a refusal, the prompt
echoed back, every digit at once, a bare "yes", filler, a JSON blob claiming success, a hedge
across several answers) go through each task's real grading path. Anything the grader accepts is
reported with the exact string that got through. The HUD quickstart's letter-count grader scores
80%: it rewards `0 1 2 3 4 5 6 7 8 9`.

![Grader health: 80% of probes rejected; all_digits and hedge were rewarded.](docs/screenshots/grader-health.jpg)

**Measures training signal.** Run a group of attempts per task and Horizon computes what GRPO
would see: per-attempt advantages, variance, pass rate, and a class per task: learnable, saturated,
impossible or flat. A job-level number says what fraction of tasks contribute zero gradient. In the
run below, a small model gets blueberry wrong every time and the other two right every time, so
the taskset would teach it nothing at this group size.

![Training signal panel: 100% zero-gradient tasks, one impossible, two saturated.](docs/screenshots/training-signal.jpg)

**Compares models per task.** Pick jobs on the same environment and see pass rates side by side,
with valid reward, infra failures, tokens and time per job.

![Compare: three jobs on the letter-count environment.](docs/screenshots/compare.jpg)

## Quickstart

Requirements: Python 3.12, [uv](https://docs.astral.sh/uv/), Node 22, pnpm. Linux or macOS (the
hud SDK needs `fcntl`; on Windows use WSL).

```bash
cp .env.example .env     # add at least one provider key, or rely on ~/.hud/.env
make setup               # uv sync + pnpm install
make dev                 # API on :8000, app on :3000
```

Open http://localhost:3000, go to Environments, paste the absolute path of a tasks file, and press
Run. The HUD quickstart's `letter-count` is a fine first environment:

```python
from hud import Environment

env = Environment(name="letter-count")

@env.template()
async def count_letter(word: str = "strawberry", letter: str = "r"):
    answer = yield f"How many '{letter}'s are in '{word}'? Reply with just the number."
    yield 1.0 if answer and str(word.count(letter)) in answer else 0.0

tasks = [count_letter(word=w) for w in ("strawberry", "raspberry", "blueberry")]
```

Or with Docker: `docker compose up --build`, put tasks files under `./envs`, and register them as
`/envs/<name>/tasks.py`.

## How it fits together

```
browser ──HTTP + SSE──▶ FastAPI (server/) ──hud SDK──▶ rollout(task, agent, runtime=SubprocessRuntime)
   ▲                        │                               │ one child process per run (the env)
   │                        ▼                               ▼ provider API
Next.js (app/)         SQLite (data/horizon.db)
```

```
server/            FastAPI, Python 3.12
  api/             routers: envs, jobs, runs, events (SSE), analytics, probes, providers
  services/
    runner.py      expands a job into rollouts, streams steps, persists results
    agents.py      the streaming wrapper around hud agents; a scripted agent for probes/tests
    triage.py      error text + stop reason + reward -> cause (pure, table-driven)
    analytics.py   summaries, histograms, GRPO group statistics
    probes.py      grader probes
    envs.py        registry; scripts/inspect_tasks.py describes a tasks file in a subprocess
  db/              SQLModel tables: envs, jobs, runs, steps, probe_results
app/               Next.js 16, TypeScript, CSS Modules. No Tailwind.
  theme/           every design token: colors (dusk/dawn), type scale, spacing, borders,
                   shadows, motion, layers, surfaces
  src/components/  shell, horizon (backdrop, gauge, LED, stat tile, knurled slider), charts,
                   jobs, trace, envs, compare, settings
envs/              your environments (empty by default; register any path)
```

### The one seam in the SDK

`hud` 0.6 exposes no hooks for observing a rollout, but `Trace.record` is the single path every
step takes, and `Run.record` is a plain method on a plain object. `services/agents.py` subclasses
whichever agent class you picked and replaces `run.record` on each run with a wrapper that also
hands the step to Horizon. Grading goes through the same method, so the final evaluate step arrives
the same way. No fork, no monkeypatching of the SDK's modules.

### Where the 67% comes from

`agents/tool_agent.py` catches any exception from the provider, sets `trace.status = "error"`,
records `Step(source="system", error=str(exc))`, and returns. `Run.__aexit__` then grades
`trace.content`, which was never set, so the grader sees `None`. Because grading succeeded,
`Job.errors` doesn't count the run as an error. Horizon's triage reads the system step's text
instead and classifies it; `tests/test_triage.py::test_the_67_percent_story` is that job.

## Development

```bash
make test   # pytest (server, includes an end-to-end job through real hud subprocess runtimes) + tsc
make lint   # ruff + eslint
```

CI runs both halves and builds the Docker images.

## Design

The theme is a single set of CSS custom properties under `app/theme/`, built in three layers:

- **Backdrop, glassmorphism.** Three soft fields of colour drift slowly behind everything.
- **Cards, minimalism.** Frosted glass panels with one hairline and generous padding, nothing else.
  Pill buttons, ink on paper.
- **Controls, skeuomorphism.** Physical faders with a raised thumb and centre mark, switches whose
  track fills with ink, a segmented control with a raised active segment, and a half-dial reward
  gauge with a pixel ring that lights up as far as the score.

Dark ("dusk") is the default; "dawn" is the light theme behind the switch. One sans family (Inter)
for everything, heavier and tighter for headings, with JetBrains Mono for identifiers and numbers.
The mosaic motif, square cells that dissolve in and shimmer, appears on the gauge, in empty states
and as a pixel sweep across primary buttons. Pages fade in, lists stagger, run lamps switch on left
to right, and numbers count up; all of it respects `prefers-reduced-motion`.

## Roadmap

- Sync jobs and traces from hud.ai (the REST client is in the SDK; the toggle is in settings).
- Per-run log capture from the environment subprocess.
- Estimated cost from a per-model price table (the SDK reports tokens, never cost).
- A richer sample environment with a shell capability, to exercise tool steps in the timeline.
