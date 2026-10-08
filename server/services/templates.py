"""The environment builder's template catalog.

Each template is a HUD environment published on GitHub: the four examples `hud init` ships (in the
hud-python repository, under environments/<id>) and the standalone template repositories. A
template says where its files live, what it needs to run (secrets, Docker, a GPU), and how Horizon
can run it once it is built.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Literal

Runtime = Literal["local", "docker", "external"]


@dataclass(frozen=True)
class Secret:
    env: str  # variable name
    label: str
    purpose: str
    url: str | None = None
    required: bool = True
    # global: a provider key kept in ~/.hud/.env for every env; env: this env's own .env only.
    scope: Literal["global", "env"] = "env"


@dataclass(frozen=True)
class Template:
    id: str
    name: str
    summary: str
    description: str
    repo: str  # owner/name on GitHub
    subdir: str | None  # directory inside the repo, None for the whole repo
    sdk_example: bool  # an example from the hud-python repo, versioned with the SDK
    tasks_file: str  # relative to the environment's directory
    env_file: str  # where `Environment(name=...)` is declared
    env_name: str  # the name declared there
    runtime: Runtime
    secrets: tuple[Secret, ...] = ()
    requirements: tuple[str, ...] = ()
    sample_tasks: tuple[str, ...] = ()
    install_default: bool = True
    install_note: str | None = None
    next_steps: tuple[str, ...] = ()
    tags: tuple[str, ...] = field(default_factory=tuple)

    @property
    def docs_url(self) -> str:
        base = f"https://github.com/{self.repo}"
        return f"{base}/tree/main/{self.subdir}" if self.subdir else f"{base}#readme"

    def public(self) -> dict:
        data = asdict(self)
        data["docs_url"] = self.docs_url
        return data


HUD_KEY = Secret(
    "HUD_API_KEY",
    "HUD API key",
    "Routes the LLM judge (and any gateway model calls) through HUD.",
    "https://hud.ai/project/api-keys",
    scope="global",
)

TEMPLATES: dict[str, Template] = {
    t.id: t
    for t in (
        Template(
            id="blank",
            name="Blank",
            summary="A minimal letter-counting task to build your own environment from.",
            description=(
                "One template, two tasks and an exact-match grader. The smallest thing that runs; "
                "edit env.py and tasks.py and press Reload."
            ),
            repo="hud-evals/hud-python",
            subdir="environments/blank",
            sdk_example=True,
            tasks_file="tasks.py",
            env_file="env.py",
            env_name="blank",
            runtime="local",
            sample_tasks=("count 'r' in 'Strawberry world'", "count 'a' in 'banana'"),
            tags=("starter",),
        ),
        Template(
            id="coding",
            name="Coding",
            summary="A repository workspace with a SWE-bench task and hidden-test grading.",
            description=(
                "The agent gets a Flask checkout and a shell, fixes an issue, and is graded by "
                "hidden JUnit tests applied after it finishes."
            ),
            repo="hud-evals/hud-python",
            subdir="environments/coding",
            sdk_example=True,
            tasks_file="tasks.py",
            env_file="env.py",
            env_name="coding",
            runtime="local",
            requirements=("git",),
            sample_tasks=("flask: add a file mode to Config.from_file()",),
            tags=("tools", "shell"),
        ),
        Template(
            id="cua",
            name="Computer Use",
            summary="A virtual Linux desktop with Chromium, computer-use tools and judged grading.",
            description=(
                "An XFCE desktop served over VNC with Chromium. Tasks are graded by shell checks "
                "on the desktop's state, an LLM judge, or both."
            ),
            repo="hud-evals/hud-python",
            subdir="environments/cua",
            sdk_example=True,
            tasks_file="tasks.py",
            env_file="env.py",
            env_name="cua",
            runtime="docker",
            secrets=(HUD_KEY,),
            requirements=("Docker", "Linux amd64"),
            sample_tasks=("open-website-example", "create-document-example", "shannon research"),
            next_steps=("hud deploy", "hud eval tasks.py claude --runtime hud"),
            tags=("desktop", "vision"),
        ),
        Template(
            id="argument-hints",
            name="Argument Hints",
            summary="A prompt, data-file attachments and rubric grading via console form hints.",
            description=(
                "Shows how task arguments become a form on hud.ai: a prompt, attached data files "
                "and weighted rubric criteria graded by an LLM."
            ),
            repo="hud-evals/hud-python",
            subdir="environments/argument-hints",
            sdk_example=True,
            tasks_file="tasks.py",
            env_file="env.py",
            env_name="argument-hints",
            runtime="local",
            secrets=(HUD_KEY,),
            sample_tasks=("name three primes under 20",),
            tags=("rubric",),
        ),
        Template(
            id="browser",
            name="Browser",
            summary="A 2048 game and a todo app the agent drives through a real Chromium.",
            description=(
                "Ten tasks over two web apps, graded by reading each app's own state over HTTP, "
                "with partial credit. Watch the desktop at localhost:8080/vnc.html."
            ),
            repo="hud-evals/hud-browser",
            subdir=None,
            sdk_example=False,
            tasks_file="tasks.py",
            env_file="env.py",
            env_name="browser",
            runtime="docker",
            secrets=(
                Secret(
                    "HUD_API_KEY",
                    "HUD API key",
                    "Only needed to deploy to hud.ai; local Docker runs don't use it.",
                    "https://hud.ai/project/api-keys",
                    required=False,
                    scope="global",
                ),
            ),
            requirements=("Docker", "Linux amd64"),
            sample_tasks=("2048-reach-256", "todo-create-groceries", "todo-rate-80"),
            next_steps=("hud deploy .", "hud eval tasks.py claude --runtime hud --full"),
            tags=("desktop", "web"),
        ),
        Template(
            id="deepresearch",
            name="Deep Research",
            summary="Live web research with Exa and person research with Sixtyfour, LLM-judged.",
            description=(
                "Research tools served over MCP. Answers are graded by an LLM judge against "
                "criteria and a ground truth, with partial credit."
            ),
            repo="hud-evals/hud-deepresearch",
            subdir=None,
            sdk_example=False,
            tasks_file="tasks.py",
            env_file="env.py",
            env_name="deepresearch",
            runtime="local",
            secrets=(
                HUD_KEY,
                Secret(
                    "EXA_API_KEY",
                    "Exa",
                    "Web search for the web_research task.",
                    "https://dashboard.exa.ai",
                ),
                Secret(
                    "SIXTYFOUR_API_KEY",
                    "Sixtyfour",
                    "Person and company research for the research_person task.",
                    "https://sixtyfour.ai",
                    required=False,
                ),
            ),
            sample_tasks=("web-research-rust-1-0", "research-jay-ram"),
            next_steps=("hud deploy . --env-file .env",),
            tags=("research", "mcp"),
        ),
        Template(
            id="worldsim",
            name="WorldSim Robotics",
            summary="Robot manipulation on a Newton physics scene, scored from simulator state.",
            description=(
                "An LLM drives a simulated gripper through a tool API: push, pick, grasp, open a "
                "drawer. Tasks run on CPU; the VLA path needs a GPU and runs outside Horizon."
            ),
            repo="hud-evals/worldsim-template",
            subdir=None,
            sdk_example=False,
            tasks_file="environment/tasks.py",
            env_file="environment/env.py",
            env_name="worldsim-robotics",
            runtime="local",
            secrets=(HUD_KEY,),
            requirements=("Python 3.12",),
            sample_tasks=("open-drawer", "pick-mug", "move-mug", "force-grasp-mug"),
            install_note="Installs mujoco, warp and the bundled Newton wheel (about 1 GB). "
            "The first run compiles Warp kernels and takes a minute.",
            next_steps=("python scripts/check_setup.py", "python run_vla.py --noop --group 1"),
            tags=("robotics", "simulation"),
        ),
        Template(
            id="ml",
            name="ML Training",
            summary="Ten ML debugging tasks on torchtitan, run on an H100 through Modal.",
            description=(
                "Embedding retrieval, VLM, Flux diffusion and MoE tasks with graders that train "
                "and evaluate real models. Too big to run here: Horizon scaffolds and configures "
                "it, then you launch on Modal."
            ),
            repo="hud-evals/ml-template",
            subdir=None,
            sdk_example=False,
            tasks_file="taskset.py",
            env_file="env.py",
            env_name="ml-template-1",
            runtime="external",
            secrets=(HUD_KEY,),
            requirements=("Modal account", "H100 80GB"),
            sample_tasks=("emb_debug_multi", "moe_debug_balance", "flux_debug_timestep"),
            install_default=False,
            install_note="Pulls torch and torchtitan (several GB). Only needed for the "
            "structural tests; tasks run on Modal.",
            next_steps=(
                "uv run modal setup",
                "uv run modal secret create hud-keys HUD_API_KEY=<your key>",
                "uv run python modal_runner.py --task emb_debug_multi",
            ),
            tags=("training", "gpu"),
        ),
    )
}
