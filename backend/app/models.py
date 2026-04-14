from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


AiMode = Literal["DISABLED", "SHAPE_ONLY", "FULL"]
JobState = Literal["queued", "running", "completed", "cancelled", "failed"]
OperationKind = Literal["install", "download"]
OperationState = Literal["running", "completed", "failed"]


class MemoryStatus(BaseModel):
    total_gb: float
    available_gb: float


class CpuStatus(BaseModel):
    name: str
    logical_cores: int
    physical_cores: int | None = None


class GpuStatus(BaseModel):
    name: str
    vendor: str
    total_vram_gb: float | None = None
    free_vram_gb: float | None = None
    driver_version: str | None = None
    cuda_available: bool = False
    rtx_capable: bool = False


class AiCapability(BaseModel):
    enabled: bool
    mode: AiMode
    reason: str
    detected_summary: str
    recommended_output: str
    requirements_url: str = "/docs/ai-requirements"


class SystemStatus(BaseModel):
    app_name: str
    app_version: str
    timestamp: datetime
    platform: str
    hostname: str
    memory: MemoryStatus
    cpu: CpuStatus
    gpus: list[GpuStatus] = Field(default_factory=list)
    ai_capability: AiCapability


class HealthStatus(BaseModel):
    status: Literal["ok"]
    timestamp: datetime


class ModelStatus(BaseModel):
    runtime_repo_present: bool
    runtime_env_ready: bool
    shape_model_downloaded: bool
    paint_model_downloaded: bool
    texture_pipeline_ready: bool
    reference_image_required: bool
    text_to_3d_supported: bool
    image_to_3d_supported: bool
    hybrid_supported: bool
    total_size_gb: float
    detail: str
    repo_path: str
    env_path: str
    models_path: str
    outputs_path: str
    notes: list[str] = Field(default_factory=list)
    active_operation: "RuntimeOperationStatus | None" = None


class GenerationRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=600)
    mode: Literal["text", "image", "hybrid"] = "text"
    generate_texture: bool = True
    resolution: Literal[256, 384, 512] = 512
    reference_image: str | None = None


class JobAccepted(BaseModel):
    job_id: str
    accepted_at: datetime


class GenerationResult(BaseModel):
    preview_name: str
    summary: str
    vertices: int
    faces: int
    output_mode: Literal["shape", "shape_texture"]
    format: Literal["glb"]
    suggested_primitive: Literal[
        "box",
        "roundedBox",
        "sphere",
        "cylinder",
        "cone",
        "torus",
        "capsule",
        "prism",
        "pyramid",
    ]
    suggested_params: dict[str, float] = Field(default_factory=dict)
    suggested_color: str
    artifact_id: str
    asset_url: str
    download_url: str
    runtime: Literal["hunyuan3d-2.1"] = "hunyuan3d-2.1"
    warning: str | None = None


class JobStatus(BaseModel):
    job_id: str
    state: JobState
    progress: int = Field(ge=0, le=100)
    stage: str
    elapsed_seconds: int
    eta_seconds: int | None = None
    vram_gb_used: float | None = None
    ram_gb_used: float | None = None
    message: str
    result: GenerationResult | None = None
    error: str | None = None


class RuntimeOperationStatus(BaseModel):
    kind: OperationKind
    state: OperationState
    progress: int = Field(ge=0, le=100)
    stage: str
    message: str
    started_at: datetime | None = None
    finished_at: datetime | None = None
    error: str | None = None


ModelStatus.model_rebuild()
