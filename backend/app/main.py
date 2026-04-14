from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.models import GenerationRequest, HealthStatus, ModelStatus, SystemStatus
from app.services.ai_runtime import runtime_manager
from app.services.system import collect_system_status


app = FastAPI(
    title="x1cad API",
    version="0.1.0",
    description="Local system and AI workflow services for the x1cad browser CAD experience.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/system/health", response_model=HealthStatus)
def health() -> HealthStatus:
    return HealthStatus(status="ok", timestamp=datetime.now(timezone.utc))


@app.get("/api/system/status", response_model=SystemStatus)
def system_status() -> SystemStatus:
    return collect_system_status()


@app.get("/api/ai/models/status", response_model=ModelStatus)
def ai_model_status() -> ModelStatus:
    return runtime_manager.status()


@app.post("/api/ai/runtime/install", response_model=ModelStatus)
def install_ai_runtime() -> ModelStatus:
    status = collect_system_status()
    if not status.ai_capability.enabled:
        raise HTTPException(status_code=400, detail=status.ai_capability.reason)

    return runtime_manager.install_runtime()


@app.post("/api/ai/models/download", response_model=ModelStatus)
def download_ai_models() -> ModelStatus:
    status = collect_system_status()
    if not status.ai_capability.enabled:
        raise HTTPException(status_code=400, detail=status.ai_capability.reason)

    include_paint = status.ai_capability.mode == "FULL"
    return runtime_manager.download_models(include_paint=include_paint)


@app.post("/api/ai/generate")
def start_generation(request: GenerationRequest):
    status = collect_system_status()
    if not status.ai_capability.enabled:
        raise HTTPException(status_code=400, detail=status.ai_capability.reason)

    models = runtime_manager.status()
    if not models.shape_model_downloaded:
        raise HTTPException(
            status_code=400,
            detail="AI models are not downloaded yet. Download them before starting generation.",
        )

    accepted = runtime_manager.create_generation_job(request, status.ai_capability.mode, status)
    return accepted


@app.get("/api/ai/jobs/{job_id}/status")
def generation_status(job_id: str):
    return runtime_manager.get_status(job_id)


@app.get("/api/ai/jobs/{job_id}/result")
def generation_result(job_id: str):
    return runtime_manager.get_result(job_id)


@app.get("/api/ai/assets/{asset_id}")
def generation_asset(asset_id: str):
    return FileResponse(runtime_manager.get_artifact_path(asset_id))


@app.delete("/api/ai/jobs/{job_id}")
def cancel_generation(job_id: str):
    runtime_manager.cancel(job_id)
    return {"ok": True}
