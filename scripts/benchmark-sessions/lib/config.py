"""
Task configuration for tk (token-killer) benchmark sessions.

Ported alongside rtk/scripts/benchmark-sessions/lib/runner.py and adapted to tk
conventions. Describes a benchmark task: the model under test, the codebase the
Claude session operates on, and per-session limits.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Codebase:
    """The codebase a Claude session works inside.

    Either a GitHub repository (cloned on the VM) or a local directory
    (tarred up and pushed to the VM).
    """

    # GitHub "owner/repo" (or full URL) when is_github is True; otherwise None.
    repo: str | None = None
    # Local path on the host when is_github is False; otherwise None.
    path: str | None = None
    # Git ref (branch / tag / commit) to check out for GitHub codebases.
    ref: str = "main"

    @property
    def is_github(self) -> bool:
        return self.repo is not None

    def local_path(self) -> Path:
        if self.path is None:
            raise ValueError("Codebase.local_path() called on a GitHub codebase")
        return Path(self.path).expanduser().resolve()

    @classmethod
    def from_dict(cls, data: dict) -> "Codebase":
        return cls(
            repo=data.get("repo"),
            path=data.get("path"),
            ref=data.get("ref", "main"),
        )


@dataclass
class TaskConfig:
    """A single benchmark task definition."""

    name: str
    model: str
    prompt: str
    codebase: Codebase
    timeout_minutes: int = 30
    # Extra environment variables exported into the Claude session.
    env: dict[str, str] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict) -> "TaskConfig":
        return cls(
            name=data["name"],
            model=data["model"],
            prompt=data["prompt"],
            codebase=Codebase.from_dict(data.get("codebase", {})),
            timeout_minutes=int(data.get("timeout_minutes", 30)),
            env=dict(data.get("env", {})),
        )

    @classmethod
    def load(cls, path: Path) -> "TaskConfig":
        data = json.loads(Path(path).read_text())
        return cls.from_dict(data)
