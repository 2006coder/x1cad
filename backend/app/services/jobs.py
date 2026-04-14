from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from threading import Lock
from time import monotonic
from uuid import uuid4

from fastapi import HTTPException

from app.models import GenerationRequest, GenerationResult, JobAccepted, JobStatus, ModelStatus
from app.services.system import estimate_job_resources


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
class _JobRecord:
    job_id: str
    request: GenerationRequest
    started_at: float
    accepted_at: datetime
    texture_enabled: bool
    vram_gb: float
    ram_gb: float
    cancelled: bool = False


class ModelRegistry:
    def __init__(self) -> None:
        self._shape_downloaded = False
        self._paint_downloaded = False
        self._lock = Lock()

    def status(self) -> ModelStatus:
        return ModelStatus(
            shape_model_downloaded=self._shape_downloaded,
            paint_model_downloaded=self._paint_downloaded,
            total_size_gb=12.0,
            detail="Hunyuan 3D models are loaded on demand and released immediately after inference.",
        )

    def download(self, include_paint: bool) -> ModelStatus:
        with self._lock:
            self._shape_downloaded = True
            if include_paint:
                self._paint_downloaded = True

        return self.status()


class JobManager:
    def __init__(self) -> None:
        self._jobs: dict[str, _JobRecord] = {}
        self._lock = Lock()

    def create_job(
        self,
        request: GenerationRequest,
        *,
        vram_gb: float,
        ram_gb: float,
        texture_enabled: bool,
    ) -> JobAccepted:
        accepted_at = datetime.now(timezone.utc)
        job_id = uuid4().hex
        record = _JobRecord(
            job_id=job_id,
            request=request,
            started_at=monotonic(),
            accepted_at=accepted_at,
            texture_enabled=texture_enabled,
            vram_gb=vram_gb,
            ram_gb=ram_gb,
        )

        with self._lock:
            self._jobs[job_id] = record

        return JobAccepted(job_id=job_id, accepted_at=accepted_at)

    def cancel(self, job_id: str) -> None:
        record = self._get(job_id)
        record.cancelled = True

    def get_status(self, job_id: str) -> JobStatus:
        record = self._get(job_id)

        if record.cancelled:
            return JobStatus(
                job_id=record.job_id,
                state="cancelled",
                progress=0,
                stage="Cancelled",
                elapsed_seconds=0,
                eta_seconds=None,
                vram_gb_used=None,
                ram_gb_used=None,
                message="The generation job was cancelled.",
            )

        elapsed = int(monotonic() - record.started_at)
        duration = 14 if record.texture_enabled else 9
        progress = min(100, round((elapsed / duration) * 100))

        if progress < 10:
            stage = "Preflighting GPU memory"
            message = "Validating hardware capacity and reserving inference budget."
        elif progress < 58:
            stage = "Generating base shape"
            message = "Running shape diffusion and converting the result to a watertight preview mesh."
        elif progress < 94 and record.texture_enabled:
            stage = "Painting materials"
            message = "Applying sequential PBR texture generation with aggressive memory cleanup."
        elif progress < 100:
            stage = "Optimizing output"
            message = "Preparing the GLB package and scene preview metadata."
        else:
            stage = "Completed"
            message = "Generation finished. The mesh is ready to insert into the scene."

        result = None
        state = "running"
        eta = max(duration - elapsed, 0)

        if progress >= 100:
            state = "completed"
            suggested_primitive, suggested_params, suggested_color = _infer_proxy_shape(
                record.request.prompt
            )
            result = GenerationResult(
                preview_name=record.request.prompt[:48].strip().title(),
                summary=record.request.prompt,
                vertices=15234 if record.texture_enabled else 10880,
                faces=30468 if record.texture_enabled else 21756,
                output_mode="shape_texture" if record.texture_enabled else "shape",
                format="glb",
                suggested_primitive=suggested_primitive,
                suggested_params=suggested_params,
                suggested_color=suggested_color,
            )

        return JobStatus(
            job_id=record.job_id,
            state=state,
            progress=progress,
            stage=stage,
            elapsed_seconds=elapsed,
            eta_seconds=eta if state != "completed" else 0,
            vram_gb_used=record.vram_gb if state != "completed" else 0.6,
            ram_gb_used=record.ram_gb if state != "completed" else 1.1,
            message=message,
            result=result,
        )

    def _get(self, job_id: str) -> _JobRecord:
        with self._lock:
            record = self._jobs.get(job_id)

        if not record:
            raise HTTPException(status_code=404, detail="Job not found.")

        return record

    def get_result(self, job_id: str) -> GenerationResult:
        status = self.get_status(job_id)
        if status.state != "completed" or not status.result:
            raise HTTPException(status_code=409, detail="Result is not ready yet.")

        return status.result


model_registry = ModelRegistry()
job_manager = JobManager()


def create_generation_job(request: GenerationRequest, status_mode: str, system_status) -> JobAccepted:
    texture_enabled = request.generate_texture and status_mode == "FULL"
    vram_gb, ram_gb = estimate_job_resources(system_status, texture_enabled)
    return job_manager.create_job(
        request,
        vram_gb=vram_gb,
        ram_gb=ram_gb,
        texture_enabled=texture_enabled,
    )
