"""
Claude session execution for tk (token-killer) benchmark sessions.

Ported alongside rtk/scripts/benchmark-sessions/lib/runner.py and adapted to tk
conventions: setup_rtk -> setup_tk, the per-session tracking artifact is tk's
history JSONL under ~/.token-killer (tk_db_path) rather than rtk's SQLite db.

Each ON VM runs Claude Code with the tk command-rewrite hook installed; each OFF
VM runs the same prompt without tk. Per-VM artifacts (stdout JSON, OTEL log, tk
history) are pulled back into the output directory.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path

from .config import Codebase, TaskConfig
from .vm import vm_exec, vm_exec_checked, vm_pull, vm_push

REMOTE_CODEBASE_DIR = "/home/ubuntu/codebase"
REMOTE_TARBALL = "/tmp/codebase.tar.gz"
# tk writes its tracking history under ~/.token-killer (see src/core/dataDir.ts).
REMOTE_TK_HOME = "/home/ubuntu/.token-killer"


@dataclass
class SessionResult:
    vm_name: str
    group: str  # "on" or "off"
    exit_code: int | None = None
    error: str | None = None
    # Local path to the pulled-back tk tracking history (None when tk was OFF).
    tk_db_path: str | None = None
    stdout_path: str | None = None
    otel_path: str | None = None


def _group_of(vm_name: str) -> str:
    return "on" if "-on-" in vm_name else "off"


async def setup_codebase(
    name: str,
    codebase: Codebase,
    local_tarball: str | None,
) -> None:
    """Deploy the task codebase onto a VM (clone from GitHub or unpack tarball)."""
    if codebase.is_github:
        assert codebase.repo is not None
        await vm_exec_checked(
            name,
            f"rm -rf {REMOTE_CODEBASE_DIR} && "
            f"git clone --depth 1 --branch {codebase.ref} "
            f"https://github.com/{codebase.repo}.git {REMOTE_CODEBASE_DIR}",
        )
    else:
        if local_tarball is None:
            raise ValueError("local_tarball is required for a non-GitHub codebase")
        await vm_push(name, local_tarball, REMOTE_TARBALL)
        await vm_exec_checked(
            name,
            f"rm -rf {REMOTE_CODEBASE_DIR} && mkdir -p {REMOTE_CODEBASE_DIR} && "
            f"tar xzf {REMOTE_TARBALL} -C {REMOTE_CODEBASE_DIR}",
        )


async def setup_tk(name: str, setup_script: Path) -> None:
    """Install and enable tk (and its Claude Code hook) on an ON VM."""
    remote_script = "/tmp/setup-tk.sh"
    await vm_push(name, setup_script, remote_script)
    await vm_exec_checked(name, f"chmod +x {remote_script} && {remote_script}")


def _build_session_command(task: TaskConfig, api_key: str, group: str) -> str:
    """Construct the remote shell command that runs one Claude session."""
    env_exports = " ".join(
        f"export {k}={v};" for k, v in task.env.items()
    )
    timeout_s = task.timeout_minutes * 60
    # On ON VMs the tk hook is already installed (setup_tk); on OFF VMs it is not.
    return (
        f"cd {REMOTE_CODEBASE_DIR} && "
        f"export ANTHROPIC_API_KEY={api_key}; "
        f"{env_exports} "
        f"timeout {timeout_s} claude --model {task.model} --print "
        f"--output-format json "
        f"--dangerously-skip-permissions "
        f"{_shell_quote(task.prompt)} "
        f"> /tmp/session-stdout.json 2> /tmp/session-otel.log"
    )


def _shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


async def _run_session(
    name: str,
    task: TaskConfig,
    api_key: str,
    output_dir: Path,
) -> SessionResult:
    group = _group_of(name)
    result = SessionResult(vm_name=name, group=group)

    try:
        command = _build_session_command(task, api_key, group)
        exit_code, _, stderr = await vm_exec(name, command)
        result.exit_code = exit_code
        if exit_code != 0 and exit_code != 124:  # 124 == timeout(1) expiry
            result.error = stderr.strip() or f"session exited with {exit_code}"

        # Pull the per-session artifacts back to the host.
        stdout_local = output_dir / f"{name}-stdout.json"
        otel_local = output_dir / f"{name}-otel.log"
        await vm_pull(name, "/tmp/session-stdout.json", stdout_local)
        await vm_pull(name, "/tmp/session-otel.log", otel_local)
        result.stdout_path = str(stdout_local)
        result.otel_path = str(otel_local)

        # ON VMs accumulated tk tracking history; pull it back too.
        if group == "on":
            tk_db_local = output_dir / f"{name}-tracking.jsonl"
            code, _, _ = await vm_exec(
                name,
                f"cat {REMOTE_TK_HOME}/projects/*/history.jsonl 2>/dev/null "
                f"> /tmp/tk-tracking.jsonl",
            )
            if code == 0:
                await vm_pull(name, "/tmp/tk-tracking.jsonl", tk_db_local)
                result.tk_db_path = str(tk_db_local)
    except Exception as exc:  # noqa: BLE001 — record, do not abort the whole pool
        result.error = str(exc)

    return result


async def run_all_sessions(
    vm_names: list[str],
    task: TaskConfig,
    api_key: str,
    output_dir: Path,
) -> list[SessionResult]:
    """Run the Claude session on every VM concurrently."""
    return list(
        await asyncio.gather(
            *(_run_session(name, task, api_key, output_dir) for name in vm_names)
        )
    )
