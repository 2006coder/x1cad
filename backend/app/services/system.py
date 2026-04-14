from __future__ import annotations

import json
import os
import platform
import socket
import subprocess
from datetime import datetime, timezone
from typing import Any

import psutil

from app.models import AiCapability, CpuStatus, GpuStatus, MemoryStatus, SystemStatus


APP_NAME = "x1cad"
APP_VERSION = "0.1.0"


def _round_gb(value: float | int | None) -> float | None:
    if value is None:
        return None

    return round(float(value) / (1024**3), 1)


def _round_numeric(value: float | int | None) -> float | None:
    if value is None:
        return None

    return round(float(value), 1)


def _run_command(command: list[str]) -> str | None:
    try:
        completed = subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return None

    output = completed.stdout.strip()
    return output or None


def _detect_windows_display_adapters() -> list[dict[str, Any]]:
    if platform.system() != "Windows":
        return []

    payload = _run_command(
        [
            "powershell",
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_VideoController | "
            "Select-Object Name, AdapterRAM | ConvertTo-Json -Compress",
        ]
    )
    if not payload:
        return []

    try:
        raw = json.loads(payload)
    except json.JSONDecodeError:
        return []

    if isinstance(raw, dict):
        raw = [raw]

    adapters: list[dict[str, Any]] = []
    for adapter in raw:
        adapters.append(
            {
                "name": adapter.get("Name", "Unknown GPU"),
                "vendor": "NVIDIA" if "nvidia" in str(adapter.get("Name", "")).lower() else "Unknown",
                "total_vram_gb": _round_gb(adapter.get("AdapterRAM")),
                "free_vram_gb": None,
                "driver_version": None,
                "cuda_available": False,
                "rtx_capable": "rtx" in str(adapter.get("Name", "")).lower(),
            }
        )

    return adapters


def _detect_nvidia_gpus() -> list[dict[str, Any]]:
    payload = _run_command(
        [
            "nvidia-smi",
            "--query-gpu=name,memory.total,memory.free,driver_version",
            "--format=csv,noheader,nounits",
        ]
    )
    if not payload:
        return []

    adapters: list[dict[str, Any]] = []
    for row in payload.splitlines():
        parts = [part.strip() for part in row.split(",")]
        if len(parts) != 4:
            continue

        name, total_mb, free_mb, driver_version = parts
        total_gb = round(float(total_mb) / 1024, 1)
        free_gb = round(float(free_mb) / 1024, 1)
        adapters.append(
            {
                "name": name,
                "vendor": "NVIDIA",
                "total_vram_gb": total_gb,
                "free_vram_gb": free_gb,
                "driver_version": driver_version,
                "cuda_available": True,
                "rtx_capable": "rtx" in name.lower(),
            }
        )

    return adapters


def detect_gpus() -> list[GpuStatus]:
    detected = _detect_nvidia_gpus()
    if not detected:
        detected = _detect_windows_display_adapters()

    return [GpuStatus(**gpu) for gpu in detected]


def decide_ai_capability(gpus: list[GpuStatus]) -> AiCapability:
    if not gpus:
        return AiCapability(
            enabled=False,
            mode="DISABLED",
            reason="No discrete NVIDIA GPU was detected.",
            detected_summary="No supported GPU found. x1cad remains fully available in CAD-only mode.",
            recommended_output="Manual CAD only",
        )

    preferred_gpu = max(
        gpus,
        key=lambda gpu: (gpu.cuda_available, gpu.total_vram_gb or 0),
    )

    if preferred_gpu.vendor != "NVIDIA":
        return AiCapability(
            enabled=False,
            mode="DISABLED",
            reason="AI generation requires an NVIDIA RTX GPU.",
            detected_summary=f"Detected {preferred_gpu.name}. Manual CAD is fully enabled.",
            recommended_output="Manual CAD only",
        )

    if not preferred_gpu.cuda_available:
        return AiCapability(
            enabled=False,
            mode="DISABLED",
            reason="CUDA runtime was not detected.",
            detected_summary=f"{preferred_gpu.name} is present but CUDA is unavailable.",
            recommended_output="Manual CAD only",
        )

    if not preferred_gpu.rtx_capable:
        return AiCapability(
            enabled=False,
            mode="DISABLED",
            reason="The detected NVIDIA GPU is not an RTX-class card.",
            detected_summary=f"{preferred_gpu.name} does not meet the RTX requirement.",
            recommended_output="Manual CAD only",
        )

    total_vram = preferred_gpu.total_vram_gb or 0
    if total_vram < 10:
        return AiCapability(
            enabled=False,
            mode="DISABLED",
            reason="At least 10 GB of VRAM is required for AI generation.",
            detected_summary=f"{preferred_gpu.name} reports {total_vram:.1f} GB VRAM.",
            recommended_output="Manual CAD only",
        )

    if total_vram < 15:
        return AiCapability(
            enabled=True,
            mode="SHAPE_ONLY",
            reason="Shape generation is supported. Texture generation should remain off.",
            detected_summary=f"{preferred_gpu.name} reports {total_vram:.1f} GB VRAM.",
            recommended_output="Shape only",
        )

    return AiCapability(
        enabled=True,
        mode="FULL",
        reason="Full sequential shape and texture generation is supported.",
        detected_summary=f"{preferred_gpu.name} reports {total_vram:.1f} GB VRAM.",
        recommended_output="Shape + texture",
    )


def collect_system_status() -> SystemStatus:
    memory = psutil.virtual_memory()
    gpus = detect_gpus()

    return SystemStatus(
        app_name=APP_NAME,
        app_version=APP_VERSION,
        timestamp=datetime.now(timezone.utc),
        platform=f"{platform.system()} {platform.release()}",
        hostname=socket.gethostname(),
        memory=MemoryStatus(
            total_gb=_round_gb(memory.total) or 0,
            available_gb=_round_gb(memory.available) or 0,
        ),
        cpu=CpuStatus(
            name=platform.processor() or os.environ.get("PROCESSOR_IDENTIFIER", "Unknown CPU"),
            logical_cores=psutil.cpu_count(logical=True) or 0,
            physical_cores=psutil.cpu_count(logical=False),
        ),
        gpus=gpus,
        ai_capability=decide_ai_capability(gpus),
    )


def estimate_job_resources(status: SystemStatus, generate_texture: bool) -> tuple[float, float]:
    ai_mode = status.ai_capability.mode
    base_ram = 8.4 if ai_mode == "FULL" else 5.2
    base_vram = 9.3 if ai_mode == "FULL" else 6.8

    if not generate_texture or ai_mode != "FULL":
        return (_round_numeric(base_vram) or 0, _round_numeric(base_ram) or 0)

    return (_round_numeric(base_vram + 3.5) or 0, _round_numeric(base_ram + 4.6) or 0)
