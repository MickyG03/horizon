# Horizon

A local-first eval cockpit for [HUD](https://hud.ai) environments. Run a HUD tasks file against any
model from the browser, watch every agent step as it streams in, and get an honest read on the
results: which runs failed because the model was wrong, which failed because the grader is weak,
and which failed because a provider returned a 503.

> Status: early. The server and app skeletons are in place; the eval runner, triage and analytics
> are landing next.

## Why

Running `hud eval` on a three-task environment produced a job that hud.ai reported as 67% with
status FAILED. The model had actually answered 2 of 2 correctly; the third run was a provider
outage that the SDK swallowed into a reward of 0 and still graded. Nothing on the dashboard
distinguished "wrong answer" from "network error", nothing flagged that the task's grader accepted
`1 2 3` as a correct count, and nothing said whether any of the tasks carried training signal.

Horizon is the tool I wanted at that moment.

## What it does

- Runs HUD evals locally with any provider key (Gemini, Anthropic, OpenAI) or a local
  OpenAI-compatible server (Ollama, LM Studio). Fully offline by default: no traces leave your
  machine unless you turn sync on.
- Streams every step of every run (prompt, reasoning, tool calls, grading) to the UI as it happens.
- Triages every failure by cause (provider outage, rate limit, auth, timeout, truncation, grader
  error, wrong answer) and reports a *valid* reward next to the raw one.
- Probes each task's grader with junk answers to surface reward-hacking risk.
- Computes per-task training signal across a group of attempts: pass rate, variance, GRPO
  advantages, and which tasks are saturated, impossible or learnable.
- Compares models on the same taskset.

## Layout

```
server/   FastAPI + the hud SDK. Runs rollouts, persists to SQLite, streams SSE.
app/      Next.js UI. No Tailwind; CSS Modules on top of the tokens in app/theme/.
envs/     Your HUD environments (tasks files). Empty by default; register any path from the UI.
```

## Quickstart

Requirements: Python 3.12, [uv](https://docs.astral.sh/uv/), Node 22, pnpm.

```bash
cp .env.example .env     # add at least one provider key
make setup               # uv sync + pnpm install
make dev                 # API on :8000, app on :3000
```

Then open http://localhost:3000.

## Development

```bash
make test   # pytest (server) + tsc (app)
make lint   # ruff (server) + eslint (app)
```
