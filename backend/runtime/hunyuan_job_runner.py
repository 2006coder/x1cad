from __future__ import annotations

import base64
import gc
import json
import os
import subprocess
import sys
from io import BytesIO
from pathlib import Path
from time import monotonic
from typing import Any
from urllib.parse import urlparse
from urllib.request import urlretrieve

import psutil
import trimesh
from PIL import Image


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def nvidia_vram_gb() -> float | None:
    try:
        completed = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=memory.used",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            check=True,
            timeout=5,
        )
    except Exception:  # noqa: BLE001
        return None

    lines = [line.strip() for line in completed.stdout.splitlines() if line.strip()]
    if not lines:
        return None

    try:
        return round(float(lines[0]) / 1024, 1)
    except ValueError:
        return None


def ram_gb_used() -> float:
    process = psutil.Process(os.getpid())
    return round(process.memory_info().rss / (1024**3), 1)


def progress(
    *,
    status_path: Path,
    job_id: str,
    started_at: float,
    state: str,
    stage: str,
    message: str,
    progress_value: int,
    result: dict[str, Any] | None = None,
    error: str | None = None,
) -> None:
    write_json(
        status_path,
        {
            "job_id": job_id,
            "state": state,
            "progress": progress_value,
            "stage": stage,
            "elapsed_seconds": int(monotonic() - started_at),
            "eta_seconds": 0 if state in {"completed", "failed"} else None,
            "vram_gb_used": nvidia_vram_gb(),
            "ram_gb_used": ram_gb_used(),
            "message": message,
            "result": result,
            "error": error,
        },
    )


def materialize_reference_image(source: str, output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if source.startswith("data:image/"):
        header, encoded = source.split(",", 1)
        raw = base64.b64decode(encoded)
        image = Image.open(BytesIO(raw)).convert("RGBA")
        image.save(output_path)
        return output_path

    parsed = urlparse(source)
    if parsed.scheme in {"http", "https"}:
        urlretrieve(source, output_path)
        return output_path

    local_path = Path(source).expanduser()
    if not local_path.exists():
        raise FileNotFoundError(f"Reference image not found: {source}")

    image = Image.open(local_path).convert("RGBA")
    image.save(output_path)
    return output_path


def mesh_stats(mesh_path: Path) -> tuple[int, int]:
    loaded = trimesh.load(mesh_path, force="scene")
    if isinstance(loaded, trimesh.Scene):
        geometries = [geometry for geometry in loaded.geometry.values()]
        if not geometries:
            return 0, 0
        merged = trimesh.util.concatenate(geometries)
        return int(len(merged.vertices)), int(len(merged.faces))

    return int(len(loaded.vertices)), int(len(loaded.faces))


def cleanup_cuda() -> None:
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:  # noqa: BLE001
        pass
    gc.collect()


def quick_convert_with_obj2gltf(create_glb_with_pbr_materials, obj_path: Path, glb_path: Path) -> None:
    textures = {
        "albedo": str(obj_path).replace(".obj", ".jpg"),
        "metallic": str(obj_path).replace(".obj", "_metallic.jpg"),
        "roughness": str(obj_path).replace(".obj", "_roughness.jpg"),
    }
    create_glb_with_pbr_materials(str(obj_path), textures, str(glb_path))


def main() -> None:
    config_path = Path(sys.argv[1])
    config = read_json(config_path)
    started_at = monotonic()

    job_id = config["job_id"]
    status_path = Path(config["paths"]["status_path"])
    result_path = Path(config["paths"]["result_path"])
    asset_path = Path(config["paths"]["asset_path"])
    repo_dir = Path(config["paths"]["repo_path"])
    models_path = Path(config["paths"]["models_path"])
    output_dir = Path(config["paths"]["output_dir"])

    os.chdir(repo_dir)
    sys.path.insert(0, str(repo_dir))
    sys.path.insert(0, str(repo_dir / "hy3dshape"))
    sys.path.insert(0, str(repo_dir / "hy3dpaint"))

    progress(
        status_path=status_path,
        job_id=job_id,
        started_at=started_at,
        state="running",
        stage="Preparing input",
        message="Normalizing the reference image for local shape generation.",
        progress_value=8,
    )

    reference_image_path = materialize_reference_image(
        config["reference_image"],
        output_dir / "reference.png",
    )

    try:
        from torchvision_fix import apply_fix

        apply_fix()
    except Exception:  # noqa: BLE001
        pass

    import torch
    from hy3dshape import Hunyuan3DDiTFlowMatchingPipeline
    from hy3dshape.rembg import BackgroundRemover

    image = Image.open(reference_image_path)
    if image.mode == "RGB":
        rembg = BackgroundRemover()
        image = rembg(image)
    image = image.convert("RGBA")

    progress(
        status_path=status_path,
        job_id=job_id,
        started_at=started_at,
        state="running",
        stage="Loading shape model",
        message="Loading Hunyuan3D-Shape into GPU memory.",
        progress_value=18,
    )

    try:
        shape_pipeline = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(str(models_path))
    except Exception:
        shape_pipeline = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(str(models_path / "hunyuan3d-dit-v2-1"))

    progress(
        status_path=status_path,
        job_id=job_id,
        started_at=started_at,
        state="running",
        stage="Generating shape",
        message="Running image-guided shape diffusion.",
        progress_value=38,
    )

    mesh = shape_pipeline(image=image)[0]
    shape_glb_path = output_dir / "shape.glb"
    mesh.export(shape_glb_path)
    del mesh
    del shape_pipeline
    cleanup_cuda()

    final_path = shape_glb_path
    warning: str | None = None
    output_mode = "shape"

    if config.get("requested_texture") and not config["generate_texture"]:
        warning = (
            "Texture generation was requested, but the local texture pipeline is not ready yet. "
            "x1cad saved the generated shape so you can keep working."
        )

    if config["generate_texture"] and config.get("texture_pipeline_ready", False):
        try:
            progress(
                status_path=status_path,
                job_id=job_id,
                started_at=started_at,
                state="running",
                stage="Loading paint model",
                message="Shape model unloaded. Loading the PBR paint stage with reduced view count.",
                progress_value=58,
            )

            from textureGenPipeline import Hunyuan3DPaintConfig, Hunyuan3DPaintPipeline
            from hy3dpaint.convert_utils import create_glb_with_pbr_materials

            max_num_view = 4 if config["resolution"] >= 512 else 3 if config["resolution"] >= 384 else 2
            paint_config = Hunyuan3DPaintConfig(max_num_view=max_num_view, resolution=config["resolution"])
            paint_config.multiview_pretrained_path = str(models_path)
            paint_config.multiview_cfg_path = str(repo_dir / "hy3dpaint" / "cfgs" / "hunyuan-paint-pbr.yaml")
            paint_config.custom_pipeline = str(repo_dir / "hy3dpaint" / "hunyuanpaintpbr")
            paint_config.realesrgan_ckpt_path = str(repo_dir / "hy3dpaint" / "ckpt" / "RealESRGAN_x4plus.pth")

            paint_pipeline = Hunyuan3DPaintPipeline(paint_config)
            textured_obj_path = output_dir / "textured.obj"

            progress(
                status_path=status_path,
                job_id=job_id,
                started_at=started_at,
                state="running",
                stage="Painting materials",
                message="Generating multiview PBR textures, then baking them back to the mesh.",
                progress_value=76,
            )

            paint_pipeline(
                mesh_path=str(shape_glb_path),
                image_path=str(reference_image_path),
                output_mesh_path=str(textured_obj_path),
                save_glb=False,
            )
            quick_convert_with_obj2gltf(create_glb_with_pbr_materials, textured_obj_path, asset_path)
            final_path = asset_path
            output_mode = "shape_texture"
            del paint_pipeline
            cleanup_cuda()
        except Exception as exc:  # noqa: BLE001
            cleanup_cuda()
            warning = (
                "Texture generation could not complete in the current runtime, so x1cad saved the untextured shape instead. "
                f"Reason: {exc}"
            )

    if final_path != asset_path:
        asset_path.write_bytes(final_path.read_bytes())

    vertices, faces = mesh_stats(asset_path)
    result = {
        "preview_name": config["prompt"][:48].strip().title() or "Generated Model",
        "summary": config["prompt"],
        "vertices": vertices,
        "faces": faces,
        "output_mode": output_mode,
        "format": "glb",
        "artifact_id": job_id,
        "asset_url": f"/api/ai/assets/{job_id}",
        "download_url": f"/api/ai/assets/{job_id}",
        "runtime": "hunyuan3d-2.1",
        "warning": warning,
    }
    write_json(result_path, result)

    progress(
        status_path=status_path,
        job_id=job_id,
        started_at=started_at,
        state="completed",
        stage="Completed",
        message=warning or "Generation finished. The GLB is ready to add to the scene.",
        progress_value=100,
        result=result,
    )


if __name__ == "__main__":
    runner_started_at = monotonic()
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        config = read_json(Path(sys.argv[1]))
        status_path = Path(config["paths"]["status_path"])
        progress(
            status_path=status_path,
            job_id=config["job_id"],
            started_at=runner_started_at,
            state="failed",
            stage="Failed",
            message="The local Hunyuan runner hit an unrecoverable error.",
            progress_value=100,
            error=str(exc),
        )
        raise
