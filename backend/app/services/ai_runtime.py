from __future__ import annotations

import json
import shutil
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock, Thread
from time import monotonic, sleep
from typing import Any
from urllib.request import urlretrieve
from uuid import uuid4

from fastapi import HTTPException

from app.models import (
    GenerationRequest,
    GenerationResult,
    JobAccepted,
    JobStatus,
    ModelStatus,
    RuntimeOperationStatus,
)
from app.services.system import estimate_job_resources


REPO_URL = "https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1.git"
REALESRGAN_URL = (
    "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth"
)

ROOT_DIR = Path(__file__).resolve().parents[3]
BACKEND_DIR = ROOT_DIR / "backend"
RUNTIME_SCRIPTS_DIR = BACKEND_DIR / "runtime"
THIRD_PARTY_DIR = ROOT_DIR / "third_party"
REPO_DIR = THIRD_PARTY_DIR / "Hunyuan3D-2.1"
AI_VENV_DIR = ROOT_DIR / ".ai-venv"
AI_DATA_DIR = BACKEND_DIR / "data" / "ai"
MODELS_DIR = AI_DATA_DIR / "models"
OUTPUTS_DIR = AI_DATA_DIR / "outputs"
INPUTS_DIR = AI_DATA_DIR / "inputs"
LOGS_DIR = AI_DATA_DIR / "logs"
RUNTIME_STATE_FILE = AI_DATA_DIR / "runtime_state.json"


def _ensure_directories() -> None:
    for directory in (THIRD_PARTY_DIR, MODELS_DIR, OUTPUTS_DIR, INPUTS_DIR, LOGS_DIR):
        directory.mkdir(parents=True, exist_ok=True)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _runtime_python() -> Path:
    if sys.platform == "win32":
        return AI_VENV_DIR / "Scripts" / "python.exe"
    return AI_VENV_DIR / "bin" / "python"


def _artifact_file(asset_id: str) -> Path:
    return OUTPUTS_DIR / asset_id / "result.glb"


def _result_file(asset_id: str) -> Path:
    return OUTPUTS_DIR / asset_id / "result.json"


def _status_file(asset_id: str) -> Path:
    return OUTPUTS_DIR / asset_id / "status.json"


def _paths_file(asset_id: str) -> Path:
    return OUTPUTS_DIR / asset_id / "paths.json"


def _load_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _runtime_state() -> dict[str, Any]:
    return _load_json(RUNTIME_STATE_FILE) or {}


def _run_checked(command: list[str], *, cwd: Path | None = None) -> None:
    completed = subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        output = completed.stderr.strip() or completed.stdout.strip() or "Command failed."
        raise RuntimeError(output)


def _infer_proxy_shape(prompt: str) -> tuple[str, dict[str, float], str]:
    normalized = prompt.lower()

    if any(keyword in normalized for keyword in ("ring", "loop", "seal", "donut")):
        return (
            "torus",
            {
                "majorRadius": 18,
                "tubeRadius": 4.6,
                "radialSegments": 24,
                "tubularSegments": 96,
                "arc": 360,
            },
            "#c084fc",
        )

    if any(keyword in normalized for keyword in ("capsule", "ergonomic", "handle")):
        return (
            "capsule",
            {
                "radius": 8.5,
                "cylinderLength": 24,
                "capSegments": 12,
                "radialSegments": 24,
            },
            "#818cf8",
        )

    if any(keyword in normalized for keyword in ("cone", "funnel", "nozzle", "rocket")):
        return (
            "cone",
            {
                "radius": 14,
                "height": 34,
                "radialSegments": 28,
            },
            "#fb7185",
        )

    if any(keyword in normalized for keyword in ("gear", "socket", "mechanical", "bolt", "nut")):
        return (
            "prism",
            {
                "circumradius": 14,
                "height": 26,
                "sides": 8,
            },
            "#f59e0b",
        )

    if any(keyword in normalized for keyword in ("sphere", "orb", "ball", "planet")):
        return (
            "sphere",
            {
                "radius": 16,
                "widthSegments": 32,
                "heightSegments": 24,
            },
            "#f472b6",
        )

    if any(keyword in normalized for keyword in ("tower", "pyramid", "spire", "obelisk")):
        return (
            "pyramid",
            {
                "baseRadius": 15,
                "height": 32,
                "sides": 4,
            },
            "#facc15",
        )

    if any(keyword in normalized for keyword in ("pipe", "column", "tube", "shaft")):
        return (
            "cylinder",
            {
                "radiusTop": 10,
                "radiusBottom": 10,
                "height": 34,
                "radialSegments": 28,
            },
            "#fb923c",
        )

    return (
        "roundedBox",
        {
            "width": 38,
            "height": 18,
            "depth": 26,
            "cornerRadius": 3.2,
            "cornerSegments": 4,
        },
        "#2dd4bf",
    )


@dataclass
class _OperationRecord:
    kind: str
    progress: int
    stage: str
    message: str
    started_at: datetime
    state: str = "running"
    finished_at: datetime | None = None
    error: str | None = None


@dataclass
class _GenerationJob:
    job_id: str
    request: GenerationRequest
    accepted_at: datetime
    texture_enabled: bool
    vram_gb: float
    ram_gb: float
    output_dir: Path
    created_at_monotonic: float
    cancelled: bool = False
    process: subprocess.Popen[str] | None = None
    error: str | None = None


class HunyuanRuntimeManager:
    def __init__(self) -> None:
        _ensure_directories()
        self._operation: _OperationRecord | None = None
        self._jobs: dict[str, _GenerationJob] = {}
        self._lock = Lock()

    def _operation_status(self) -> RuntimeOperationStatus | None:
        if not self._operation:
            return None

        return RuntimeOperationStatus(
            kind=self._operation.kind,  # type: ignore[arg-type]
            state=self._operation.state,  # type: ignore[arg-type]
            progress=self._operation.progress,
            stage=self._operation.stage,
            message=self._operation.message,
            started_at=self._operation.started_at,
            finished_at=self._operation.finished_at,
            error=self._operation.error,
        )

    def _update_operation(
        self,
        *,
        progress: int,
        stage: str,
        message: str,
        state: str = "running",
        error: str | None = None,
    ) -> None:
        with self._lock:
            if not self._operation:
                return

            self._operation.progress = progress
            self._operation.stage = stage
            self._operation.message = message
            self._operation.state = state
            self._operation.error = error
            if state != "running":
                self._operation.finished_at = _now()

    def _begin_operation(self, kind: str) -> bool:
        with self._lock:
            if self._operation and self._operation.state == "running":
                return False

            self._operation = _OperationRecord(
                kind=kind,
                progress=0,
                stage="Queued",
                message=f"{kind.title()} request accepted.",
                started_at=_now(),
            )
            return True

    def _finish_operation(self, *, success: bool, message: str, error: str | None = None) -> None:
        self._update_operation(
            progress=100 if success else max(self._operation.progress if self._operation else 0, 5),
            stage="Completed" if success else "Failed",
            message=message,
            state="completed" if success else "failed",
            error=error,
        )

    def status(self) -> ModelStatus:
        runtime_state = _runtime_state()
        repo_present = (REPO_DIR / "README.md").exists()
        env_ready = bool(runtime_state.get("runtime_env_ready")) and _runtime_python().exists()
        shape_downloaded = (MODELS_DIR / "hunyuan3d-dit-v2-1").exists()
        paint_downloaded = (MODELS_DIR / "hunyuan3d-paintpbr-v2-1").exists()
        realesrgan_ready = (REPO_DIR / "hy3dpaint" / "ckpt" / "RealESRGAN_x4plus.pth").exists()
        custom_rasterizer_ready = any(
            (REPO_DIR / "hy3dpaint" / "custom_rasterizer").glob("custom_rasterizer_kernel*.pyd")
        ) or any((REPO_DIR / "hy3dpaint" / "custom_rasterizer").glob("custom_rasterizer_kernel*.so"))
        mesh_inpaint_ready = any(
            (REPO_DIR / "hy3dpaint" / "DifferentiableRenderer").glob("mesh_inpaint_processor*.pyd")
        ) or any(
            (REPO_DIR / "hy3dpaint" / "DifferentiableRenderer").glob("mesh_inpaint_processor*.so")
        )
        texture_pipeline_ready = paint_downloaded and realesrgan_ready and custom_rasterizer_ready and mesh_inpaint_ready

        notes = [
            "x1cad runs Tencent Hunyuan3D 2.1 directly through a local managed runtime rather than Tencent's demo API server.",
            "The current upstream open workflow is image-guided. For best results use an uploaded concept image, sketch, or viewport screenshot.",
        ]
        if runtime_state.get("warning"):
            notes.append(str(runtime_state["warning"]))
        if paint_downloaded and not texture_pipeline_ready:
            notes.append(
                "Texture weights are present, but one or more native paint components are still missing. x1cad will gracefully fall back to shape-only generation until those finish building."
            )

        detail = (
            "Local Hunyuan runtime is ready for direct image-guided generation."
            if repo_present and env_ready and shape_downloaded
            else "Prepare the local Hunyuan runtime, then download the model weights to unlock real generation."
        )

        return ModelStatus(
            runtime_repo_present=repo_present,
            runtime_env_ready=env_ready,
            shape_model_downloaded=shape_downloaded,
            paint_model_downloaded=paint_downloaded,
            texture_pipeline_ready=texture_pipeline_ready,
            reference_image_required=True,
            text_to_3d_supported=False,
            image_to_3d_supported=True,
            hybrid_supported=True,
            total_size_gb=12.0,
            detail=detail,
            repo_path=str(REPO_DIR),
            env_path=str(AI_VENV_DIR),
            models_path=str(MODELS_DIR),
            outputs_path=str(OUTPUTS_DIR),
            notes=notes,
            active_operation=self._operation_status(),
        )

    def install_runtime(self) -> ModelStatus:
        if not self._begin_operation("install"):
            return self.status()

        Thread(target=self._run_install_runtime, daemon=True).start()
        return self.status()

    def _run_install_runtime(self) -> None:
        try:
            _ensure_directories()
            build_warning: str | None = None

            self._update_operation(
                progress=8,
                stage="Preparing runtime",
                message="Creating local folders for the dedicated Hunyuan runtime.",
            )

            if not REPO_DIR.exists():
                self._update_operation(
                    progress=18,
                    stage="Cloning Tencent repo",
                    message="Downloading the official Hunyuan3D 2.1 repository.",
                )
                _run_checked(["git", "clone", "--depth", "1", REPO_URL, str(REPO_DIR)], cwd=ROOT_DIR)

            runtime_python = _runtime_python()
            if not runtime_python.exists():
                self._update_operation(
                    progress=32,
                    stage="Creating AI environment",
                    message="Building a dedicated Python virtual environment for GPU inference.",
                )
                _run_checked([sys.executable, "-m", "venv", str(AI_VENV_DIR)], cwd=ROOT_DIR)

            self._update_operation(
                progress=46,
                stage="Installing Python packages",
                message="Installing the curated Hunyuan runtime dependencies.",
            )
            _run_checked([str(runtime_python), "-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"])
            _run_checked(
                [
                    str(runtime_python),
                    "-m",
                    "pip",
                    "install",
                    "torch==2.5.1",
                    "torchvision==0.20.1",
                    "torchaudio==2.5.1",
                    "--index-url",
                    "https://download.pytorch.org/whl/cu124",
                ]
            )
            _run_checked(
                [
                    str(runtime_python),
                    "-m",
                    "pip",
                    "install",
                    "-r",
                    str(RUNTIME_SCRIPTS_DIR / "hunyuan_runtime_requirements.txt"),
                ],
                cwd=ROOT_DIR,
            )

            ckpt_dir = REPO_DIR / "hy3dpaint" / "ckpt"
            ckpt_dir.mkdir(parents=True, exist_ok=True)
            realesrgan_path = ckpt_dir / "RealESRGAN_x4plus.pth"
            if not realesrgan_path.exists():
                self._update_operation(
                    progress=60,
                    stage="Fetching paint assets",
                    message="Downloading the Real-ESRGAN enhancement checkpoint required by the paint pipeline.",
                )
                urlretrieve(REALESRGAN_URL, realesrgan_path)

            try:
                self._update_operation(
                    progress=74,
                    stage="Building rasterizer",
                    message="Compiling the custom rasterizer extension for the local paint runtime.",
                )
                _run_checked(
                    [str(runtime_python), str(RUNTIME_SCRIPTS_DIR / "build_custom_rasterizer.py"), "--repo", str(REPO_DIR)],
                    cwd=ROOT_DIR,
                )

                self._update_operation(
                    progress=88,
                    stage="Building mesh painter",
                    message="Compiling the mesh inpaint extension used during PBR baking.",
                )
                _run_checked(
                    [str(runtime_python), str(RUNTIME_SCRIPTS_DIR / "build_mesh_inpaint.py"), "--repo", str(REPO_DIR)],
                    cwd=ROOT_DIR,
                )
            except Exception as build_exc:  # noqa: BLE001
                build_warning = (
                    "The base Hunyuan runtime is installed, but the optional native paint extensions "
                    f"did not finish building yet: {build_exc}"
                )

            self._finish_operation(
                success=True,
                message=build_warning
                or "The local Hunyuan runtime is installed and ready for model downloads.",
            )
            _write_json(
                RUNTIME_STATE_FILE,
                {
                    "runtime_env_ready": True,
                    "warning": build_warning,
                    "updated_at": _now().isoformat(),
                },
            )
        except Exception as exc:  # noqa: BLE001
            _write_json(
                RUNTIME_STATE_FILE,
                {
                    "runtime_env_ready": False,
                    "warning": str(exc),
                    "updated_at": _now().isoformat(),
                },
            )
            self._finish_operation(
                success=False,
                message="x1cad could not finish preparing the local Hunyuan runtime.",
                error=str(exc),
            )

    def download_models(self, *, include_paint: bool) -> ModelStatus:
        if not self.status().runtime_env_ready:
            raise HTTPException(status_code=409, detail="Install the local AI runtime before downloading models.")

        if not self._begin_operation("download"):
            return self.status()

        Thread(target=self._run_download_models, kwargs={"include_paint": include_paint}, daemon=True).start()
        return self.status()

    def _run_download_models(self, *, include_paint: bool) -> None:
        runtime_python = _runtime_python()
        try:
            self._update_operation(
                progress=10,
                stage="Preparing download",
                message="Checking the Hugging Face cache and resuming any partial model downloads.",
            )
            command = [
                str(runtime_python),
                str(RUNTIME_SCRIPTS_DIR / "download_hunyuan_models.py"),
                "--output-dir",
                str(MODELS_DIR),
            ]
            if include_paint:
                command.append("--include-paint")

            self._update_operation(
                progress=44,
                stage="Downloading weights",
                message="Fetching the local Hunyuan3D model snapshots from Hugging Face.",
            )
            _run_checked(command, cwd=ROOT_DIR)
            self._finish_operation(
                success=True,
                message="Model downloads completed. x1cad can now launch real local generation jobs.",
            )
        except Exception as exc:  # noqa: BLE001
            self._finish_operation(
                success=False,
                message="Model download failed before the local cache was fully prepared.",
                error=str(exc),
            )

    def create_generation_job(self, request: GenerationRequest, status_mode: str, system_status) -> JobAccepted:
        status = self.status()
        if not status.runtime_env_ready:
            raise HTTPException(status_code=409, detail="Install the local Hunyuan runtime before generating.")
        if not status.shape_model_downloaded:
            raise HTTPException(status_code=409, detail="Download the shape model before generating.")
        if not request.reference_image:
            raise HTTPException(
                status_code=400,
                detail=(
                    "The current upstream Hunyuan3D 2.1 integration is image-guided. "
                    "Add a reference image, sketch, or viewport screenshot before generating."
                ),
            )

        texture_enabled = request.generate_texture and status_mode == "FULL" and status.texture_pipeline_ready
        vram_gb, ram_gb = estimate_job_resources(system_status, texture_enabled)
        accepted_at = _now()
        job_id = uuid4().hex
        output_dir = OUTPUTS_DIR / job_id
        output_dir.mkdir(parents=True, exist_ok=True)

        job = _GenerationJob(
            job_id=job_id,
            request=request,
            accepted_at=accepted_at,
            texture_enabled=texture_enabled,
            vram_gb=vram_gb,
            ram_gb=ram_gb,
            output_dir=output_dir,
            created_at_monotonic=monotonic(),
        )

        with self._lock:
            self._jobs[job_id] = job

        self._write_job_status(
            job,
            {
                "job_id": job.job_id,
                "state": "queued",
                "progress": 0,
                "stage": "Queued",
                "elapsed_seconds": 0,
                "eta_seconds": None,
                "vram_gb_used": None,
                "ram_gb_used": None,
                "message": "The job is waiting for the local Hunyuan runner.",
                "result": None,
                "error": None,
            },
        )

        Thread(target=self._run_generation_job, args=(job,), daemon=True).start()
        return JobAccepted(job_id=job_id, accepted_at=accepted_at)

    def _write_job_status(self, job: _GenerationJob, payload: dict[str, Any]) -> None:
        payload.setdefault("job_id", job.job_id)
        payload.setdefault("elapsed_seconds", int(monotonic() - job.created_at_monotonic))
        payload.setdefault("result", None)
        payload.setdefault("error", None)
        _write_json(_status_file(job.job_id), payload)

    def _run_generation_job(self, job: _GenerationJob) -> None:
        runtime_python = _runtime_python()
        status = self.status()

        config_path = job.output_dir / "job.json"
        paths = {
            "repo_path": str(REPO_DIR),
            "models_path": str(MODELS_DIR),
            "output_dir": str(job.output_dir),
            "status_path": str(_status_file(job.job_id)),
            "result_path": str(_result_file(job.job_id)),
            "asset_path": str(_artifact_file(job.job_id)),
        }
        _write_json(_paths_file(job.job_id), paths)
        _write_json(
            config_path,
            {
                "job_id": job.job_id,
                "prompt": job.request.prompt,
                "mode": job.request.mode,
                "generate_texture": job.texture_enabled,
                "requested_texture": job.request.generate_texture,
                "resolution": job.request.resolution,
                "reference_image": job.request.reference_image,
                "paths": paths,
                "texture_pipeline_ready": status.texture_pipeline_ready,
            },
        )

        command = [str(runtime_python), str(RUNTIME_SCRIPTS_DIR / "hunyuan_job_runner.py"), str(config_path)]
        log_path = LOGS_DIR / f"{job.job_id}.log"

        with log_path.open("w", encoding="utf-8") as stream:
            process = subprocess.Popen(  # noqa: S603
                command,
                cwd=str(ROOT_DIR),
                stdout=stream,
                stderr=subprocess.STDOUT,
                text=True,
            )
            job.process = process
            exit_code = process.wait()

        if job.cancelled:
            return

        if exit_code != 0:
            payload = _load_json(_status_file(job.job_id))
            if not payload or payload.get("state") not in {"completed", "failed"}:
                self._write_job_status(
                    job,
                    {
                        "state": "failed",
                        "progress": 100,
                        "stage": "Failed",
                        "eta_seconds": 0,
                        "vram_gb_used": None,
                        "ram_gb_used": None,
                        "message": "The local Hunyuan runner exited before producing a valid result.",
                        "error": "See the backend AI log for details.",
                    },
                )

    def get_status(self, job_id: str) -> JobStatus:
        job = self._get_job(job_id)
        payload = _load_json(_status_file(job.job_id))
        if not payload:
            return JobStatus(
                job_id=job.job_id,
                state="queued",
                progress=0,
                stage="Queued",
                elapsed_seconds=int(monotonic() - job.created_at_monotonic),
                eta_seconds=None,
                vram_gb_used=None,
                ram_gb_used=None,
                message="The local Hunyuan runner has not reported progress yet.",
                result=None,
                error=None,
            )

        if payload.get("result"):
            payload["result"] = self.get_result(job_id)

        return JobStatus(**payload)

    def get_result(self, job_id: str) -> GenerationResult:
        job = self._get_job(job_id)
        payload = _load_json(_result_file(job.job_id))
        if not payload:
            raise HTTPException(status_code=409, detail="Result is not ready yet.")

        suggested_primitive, suggested_params, suggested_color = _infer_proxy_shape(job.request.prompt)
        payload.setdefault("artifact_id", job.job_id)
        payload.setdefault("asset_url", f"/api/ai/assets/{job.job_id}")
        payload.setdefault("download_url", f"/api/ai/assets/{job.job_id}")
        payload.setdefault("runtime", "hunyuan3d-2.1")
        payload.setdefault("suggested_primitive", suggested_primitive)
        payload.setdefault("suggested_params", suggested_params)
        payload.setdefault("suggested_color", suggested_color)

        return GenerationResult(**payload)

    def get_artifact_path(self, job_id: str) -> Path:
        artifact = _artifact_file(job_id)
        if not artifact.exists():
            raise HTTPException(status_code=404, detail="Generated asset not found.")
        return artifact

    def cancel(self, job_id: str) -> None:
        job = self._get_job(job_id)
        job.cancelled = True
        if job.process and job.process.poll() is None:
            job.process.terminate()
            for _ in range(20):
                if job.process.poll() is not None:
                    break
                sleep(0.2)
            if job.process.poll() is None:
                job.process.kill()

        self._write_job_status(
            job,
            {
                "state": "cancelled",
                "progress": 0,
                "stage": "Cancelled",
                "eta_seconds": None,
                "vram_gb_used": None,
                "ram_gb_used": None,
                "message": "The generation job was cancelled and the local runner was stopped.",
                "error": None,
            },
        )

    def _get_job(self, job_id: str) -> _GenerationJob:
        with self._lock:
            job = self._jobs.get(job_id)

        if not job:
            raise HTTPException(status_code=404, detail="Job not found.")
        return job


runtime_manager = HunyuanRuntimeManager()
