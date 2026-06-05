"""
terminal-bench precision runner for tg (token-guard) benchmark sessions.

Ported alongside rtk/scripts/benchmark-sessions/lib/runner.py and adapted to tg
conventions (tg ON/OFF groups). Runs the terminal-bench harness on a VM and
parses its JSON results into a structured TbResult consumed by runner.py.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field

from .vm import vm_exec

REMOTE_TB_RESULTS = "/tmp/terminal-bench-results.json"


@dataclass
class TbTaskResult:
    name: str
    passed: bool
    duration_s: float


@dataclass
class TbResult:
    vm_name: str
    group: str  # "on" or "off"
    total: int = 0
    passed: int = 0
    failed: int = 0
    tasks: list[TbTaskResult] = field(default_factory=list)
    error: str | None = None


def _parse_results(vm_name: str, group: str, raw: str) -> TbResult:
    """Parse terminal-bench JSON output into a TbResult."""
    result = TbResult(vm_name=vm_name, group=group)
    data = json.loads(raw)

    tasks = data.get("results") or data.get("tasks") or []
    for entry in tasks:
        name = entry.get("task_id") or entry.get("name", "<unknown>")
        passed = bool(entry.get("passed") or entry.get("is_resolved"))
        duration = float(entry.get("duration_s") or entry.get("duration", 0.0))
        result.tasks.append(
            TbTaskResult(name=name, passed=passed, duration_s=duration)
        )

    result.total = len(result.tasks)
    result.passed = sum(1 for t in result.tasks if t.passed)
    result.failed = result.total - result.passed
    return result


async def run_terminal_bench(
    vm_name: str,
    group: str,
    model: str,
    api_key: str,
) -> TbResult:
    """Run terminal-bench on the VM and return parsed results.

    Any failure is captured into ``TbResult.error`` so a single broken VM does
    not abort the whole benchmark run.
    """
    command = (
        f"export ANTHROPIC_API_KEY={api_key}; "
        f"tb run --agent claude-code --model {model} "
        f"--output-json {REMOTE_TB_RESULTS} 2>&1; "
        f"cat {REMOTE_TB_RESULTS}"
    )

    try:
        exit_code, stdout, stderr = await vm_exec(vm_name, command)
        if exit_code != 0 and not stdout.strip():
            return TbResult(
                vm_name=vm_name,
                group=group,
                error=stderr.strip() or f"terminal-bench exited with {exit_code}",
            )
        # The harness prints the JSON results as the final line(s) of stdout.
        json_start = stdout.find("{")
        if json_start < 0:
            return TbResult(
                vm_name=vm_name,
                group=group,
                error="no JSON results in terminal-bench output",
            )
        return _parse_results(vm_name, group, stdout[json_start:])
    except Exception as exc:  # noqa: BLE001 — record, do not abort the pool
        return TbResult(vm_name=vm_name, group=group, error=str(exc))
