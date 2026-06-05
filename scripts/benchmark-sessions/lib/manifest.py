"""
Run manifest model for tk (token-killer) benchmark sessions.

Ported alongside rtk/scripts/benchmark-sessions/lib/runner.py and adapted to tk
conventions: the per-session tracking artifact is tk's history (tk_db) rather
than rtk's SQLite db. Serializes the manifest to manifest.json in the output
directory.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path


@dataclass
class SessionEntry:
    vm_name: str
    group: str
    stdout_json: str
    otel_log: str
    # tk tracking history filename (None when tk was OFF for this VM).
    tk_db: str | None = None
    exit_code: int | None = None
    error: str | None = None


@dataclass
class TbTaskEntry:
    name: str
    passed: bool
    duration_s: float


@dataclass
class TbEntry:
    vm_name: str
    group: str
    total: int
    passed: int
    failed: int
    tasks: list[TbTaskEntry] = field(default_factory=list)
    error: str | None = None


@dataclass
class RunManifest:
    task_name: str
    model: str
    vm_count: int
    created_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    sessions: list[SessionEntry] = field(default_factory=list)
    terminal_bench: list[TbEntry] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def write_manifest(manifest: RunManifest, output_dir: Path) -> Path:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / "manifest.json"
    out_path.write_text(json.dumps(manifest.to_dict(), indent=2))
    return out_path
