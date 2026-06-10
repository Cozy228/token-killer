"""
Cloud VM pool management for tk (token-killer) benchmark sessions.

Ported alongside rtk/scripts/benchmark-sessions/lib/runner.py and adapted to tk
conventions (VM naming uses a "tk-bench" prefix; ON/OFF groups). Uses
`gcloud compute` to provision a pool of ephemeral VMs, half running tk ON and
half running tk OFF, then tears them down.

VM naming: ``{PREFIX}-{group}-{index}`` (e.g. ``tk-bench-on-0``). The ``-on-`` /
``-off-`` infixes are what runner.py uses to split the pool into groups.
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

VM_PREFIX = "tk-bench"
ZONE = os.environ.get("TK_BENCH_ZONE", "us-central1-a")
MACHINE_TYPE = os.environ.get("TK_BENCH_MACHINE_TYPE", "e2-standard-4")
IMAGE_FAMILY = os.environ.get("TK_BENCH_IMAGE_FAMILY", "ubuntu-2404-lts-amd64")
IMAGE_PROJECT = os.environ.get("TK_BENCH_IMAGE_PROJECT", "ubuntu-os-cloud")
SSH_USER = os.environ.get("TK_BENCH_SSH_USER", "ubuntu")


async def _run(*args: str) -> tuple[int, str, str]:
    """Run a command, returning (exit_code, stdout, stderr)."""
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    out, err = await proc.communicate()
    return proc.returncode or 0, out.decode(), err.decode()


async def _run_checked(*args: str) -> str:
    code, out, err = await _run(*args)
    if code != 0:
        raise RuntimeError(f"Command failed ({' '.join(args)}):\n{err or out}")
    return out


async def _create_vm(name: str, cloud_init: Path) -> str:
    """Create a single VM with the given cloud-init startup script."""
    await _run_checked(
        "gcloud",
        "compute",
        "instances",
        "create",
        name,
        f"--zone={ZONE}",
        f"--machine-type={MACHINE_TYPE}",
        f"--image-family={IMAGE_FAMILY}",
        f"--image-project={IMAGE_PROJECT}",
        f"--metadata-from-file=user-data={cloud_init}",
        "--quiet",
    )
    return name


async def create_vm_pool(vms: int, cloud_init: Path) -> list[str]:
    """Create ``vms`` ON VMs and ``vms`` OFF VMs in parallel.

    Returns the list of created VM names. On any failure, already-created VMs
    are torn down before the error propagates.
    """
    names = [f"{VM_PREFIX}-on-{i}" for i in range(vms)]
    names += [f"{VM_PREFIX}-off-{i}" for i in range(vms)]

    created: list[str] = []
    try:
        results = await asyncio.gather(
            *(_create_vm(name, cloud_init) for name in names)
        )
        created = list(results)
    except Exception:
        if created:
            await destroy_vm_pool(created)
        raise

    # Wait for SSH to come up on every VM before handing the pool back.
    await asyncio.gather(*(_wait_for_ssh(name) for name in created))
    return created


async def _wait_for_ssh(name: str, max_wait_sec: int = 300) -> None:
    """Poll until the VM accepts SSH (cloud-init may still be running)."""
    loop = asyncio.get_event_loop()
    start = loop.time()
    while loop.time() - start < max_wait_sec:
        code, _, _ = await vm_exec(name, "true")
        if code == 0:
            return
        await asyncio.sleep(5)
    raise TimeoutError(f"VM {name} did not become reachable via SSH")


async def destroy_vm_pool(vm_names: list[str]) -> None:
    """Delete every VM in the pool, ignoring individual failures."""
    await asyncio.gather(
        *(_destroy_vm(name) for name in vm_names),
        return_exceptions=True,
    )


async def _destroy_vm(name: str) -> None:
    await _run(
        "gcloud",
        "compute",
        "instances",
        "delete",
        name,
        f"--zone={ZONE}",
        "--quiet",
    )


async def vm_exec(name: str, command: str) -> tuple[int, str, str]:
    """Run a shell command on the VM over SSH."""
    return await _run(
        "gcloud",
        "compute",
        "ssh",
        f"{SSH_USER}@{name}",
        f"--zone={ZONE}",
        "--command",
        command,
        "--quiet",
    )


async def vm_exec_checked(name: str, command: str) -> str:
    code, out, err = await vm_exec(name, command)
    if code != 0:
        raise RuntimeError(f"Remote command failed on {name}:\n{err or out}")
    return out


async def vm_push(name: str, local_path: str | Path, remote_path: str) -> None:
    """Copy a local file to the VM via scp."""
    await _run_checked(
        "gcloud",
        "compute",
        "scp",
        str(local_path),
        f"{SSH_USER}@{name}:{remote_path}",
        f"--zone={ZONE}",
        "--quiet",
    )


async def vm_pull(name: str, remote_path: str, local_path: str | Path) -> None:
    """Copy a remote file from the VM to the host via scp."""
    await _run_checked(
        "gcloud",
        "compute",
        "scp",
        f"{SSH_USER}@{name}:{remote_path}",
        str(local_path),
        f"--zone={ZONE}",
        "--quiet",
    )
