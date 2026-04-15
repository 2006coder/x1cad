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

import numpy as np
import psutil
import trimesh
from PIL import Image, ImageOps

from hunyuan_repo_patches import apply_hunyuan_runtime_patches


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8-sig"))


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


def system_total_ram_gb() -> float:
    return round(psutil.virtual_memory().total / (1024**3), 1)


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


def gpu_total_vram_gb(torch) -> float | None:
    if not torch.cuda.is_available():
        return None

    try:
        return round(torch.cuda.get_device_properties(0).total_memory / (1024**3), 1)
    except Exception:  # noqa: BLE001
        return None


def merge_warnings(existing: str | None, new_warning: str | None) -> str | None:
    if not new_warning:
        return existing
    if not existing:
        return new_warning
    return f"{existing} {new_warning}"


def square_resolution(target_resolution: int) -> int:
    return {256: 384, 384: 512, 512: 512}.get(target_resolution, 512)


def normalize_prompt(prompt: str, *, repair: bool = False) -> str:
    base = prompt.strip()
    if not base:
        base = "compact industrial design object"

    if repair:
        return (
            f"{base}. Single solid 3D object render with visible depth, filled surfaces, and realistic product shading. "
            "Three-quarter isometric view. Clean white background. Soft studio light. "
            "Avoid a flat diagram or wireframe look."
        )
    return (
        f"{base}. Single solid 3D industrial product render. Three-quarter isometric view. "
        "Clean white background. Soft studio lighting. Realistic shading. Visible depth and thickness."
    )


def fit_image_to_square(image: Image.Image, size: int) -> Image.Image:
    image = image.convert("RGBA")
    contained = image.copy()
    contained.thumbnail((size, size), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    offset = ((size - contained.width) // 2, (size - contained.height) // 2)
    canvas.paste(contained, offset, contained if contained.mode == "RGBA" else None)
    return canvas


def stabilized_shape_reference(image: Image.Image, size: int) -> Image.Image:
    squared = fit_image_to_square(image.convert("RGBA"), size)
    white_backdrop = Image.new("RGBA", squared.size, (255, 255, 255, 255))
    white_backdrop.alpha_composite(squared)
    contrasted = ImageOps.autocontrast(white_backdrop.convert("RGB"), cutoff=1)
    return contrasted.convert("RGBA")


def guide_image_metrics(image: Image.Image) -> dict[str, float]:
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0
    luminance = rgb.mean(axis=2)
    occupied = luminance < 0.97
    occupancy = float(occupied.mean())
    mean_luminance = float(luminance.mean())
    std_luminance = float(luminance.std())
    height, width = occupied.shape
    center_y0, center_y1 = height // 4, max(height // 4 + 1, (height * 3) // 4)
    center_x0, center_x1 = width // 4, max(width // 4 + 1, (width * 3) // 4)
    center_region = occupied[center_y0:center_y1, center_x0:center_x1]
    center_occupancy = float(center_region.mean()) if center_region.size else occupancy
    total_occupied = float(occupied.sum())
    center_occupied = float(center_region.sum()) if center_region.size else total_occupied
    border_area = float(occupied.size - center_region.size)
    border_occupancy = (
        float((total_occupied - center_occupied) / border_area)
        if border_area > 0
        else occupancy
    )

    ys, xs = np.where(occupied)
    if xs.size == 0 or ys.size == 0:
        return {
            "occupancy": 0.0,
            "bbox_fill": 0.0,
            "mean_luminance": mean_luminance,
            "std_luminance": std_luminance,
            "center_occupancy": center_occupancy,
            "border_occupancy": border_occupancy,
        }

    bbox_area = float((xs.max() - xs.min() + 1) * (ys.max() - ys.min() + 1))
    bbox_fill = float(xs.size / bbox_area) if bbox_area else 0.0
    return {
        "occupancy": occupancy,
        "bbox_fill": bbox_fill,
        "mean_luminance": mean_luminance,
        "std_luminance": std_luminance,
        "center_occupancy": center_occupancy,
        "border_occupancy": border_occupancy,
    }


def guide_image_problem(image: Image.Image) -> str | None:
    metrics = guide_image_metrics(image)
    if metrics["mean_luminance"] < 0.03:
        return "near-black"
    if metrics["mean_luminance"] > 0.99:
        return "nearly blank"
    if metrics["std_luminance"] < 0.018:
        return "too flat"
    if metrics["occupancy"] < 0.02:
        return "nearly empty"
    if (
        metrics["occupancy"] < 0.14
        and metrics["center_occupancy"] < 0.02
        and metrics["border_occupancy"] > metrics["center_occupancy"] * 2.0
    ):
        return "frame-like"
    if metrics["occupancy"] < 0.08 and metrics["bbox_fill"] < 0.12:
        return "too sparse"
    return None


def guide_image_needs_repair(image: Image.Image) -> bool:
    return guide_image_problem(image) is not None


def preferred_torch_dtype(torch) -> Any:
    if torch.cuda.is_available() and hasattr(torch.cuda, "is_bf16_supported") and torch.cuda.is_bf16_supported():
        return torch.bfloat16
    return torch.float16


def use_cpu_offload_for_bridge(torch) -> bool:
    forced = os.environ.get("X1CAD_FORCE_ZIMAGE_CPU_OFFLOAD")
    if forced == "1":
        return True
    if forced == "0":
        return False

    if not torch.cuda.is_available():
        return False

    return True


def bridge_needs_extra_conservation(torch) -> bool:
    total_memory_gb = gpu_total_vram_gb(torch)
    total_ram_gb = system_total_ram_gb()
    return (
        (total_memory_gb is not None and total_memory_gb <= 16.5)
        or total_ram_gb <= 32.5
    )


def build_seeded_generator(torch, seed: int = 42) -> Any:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    return torch.Generator(device).manual_seed(seed)


def maybe_enable_flash_attention(pipeline) -> None:
    transformer = getattr(pipeline, "transformer", None)
    if transformer is None or not hasattr(transformer, "set_attention_backend"):
        return

    for backend in ("flash", "_flash_3"):
        try:
            transformer.set_attention_backend(backend)
            return
        except Exception:  # noqa: BLE001
            continue


def pipeline_image_to_pil(image: Any) -> tuple[Image.Image, str | None]:
    image_array = np.asarray(image, dtype=np.float32)
    if image_array.ndim == 4:
        image_array = image_array[0]

    if image_array.ndim != 3:
        raise RuntimeError(f"Unexpected Z-Image output shape: {image_array.shape}")

    warning: str | None = None
    finite_mask = np.isfinite(image_array)
    if not finite_mask.any():
        raise RuntimeError("Z-Image produced a non-finite guide image.")

    if not finite_mask.all():
        finite_values = image_array[finite_mask]
        fill_value = float(finite_values.mean()) if finite_values.size else 0.5
        image_array = np.nan_to_num(image_array, nan=fill_value, posinf=1.0, neginf=0.0)
        warning = (
            "Z-Image returned partially non-finite pixels, so x1cad sanitized the guide image before continuing."
        )

    image_array = np.clip(image_array, 0.0, 1.0)
    if image_array.shape[-1] == 1:
        image_array = np.repeat(image_array, 3, axis=2)
    elif image_array.shape[-1] == 4:
        image_array = image_array[:, :, :3]
    elif image_array.shape[-1] != 3:
        raise RuntimeError(f"Unexpected Z-Image channel count: {image_array.shape[-1]}")

    pil_image = Image.fromarray((image_array * 255).round().astype(np.uint8), mode="RGB")
    return pil_image, warning


def pipeline_output_to_pil(image: Any) -> tuple[Image.Image, str | None]:
    if isinstance(image, Image.Image):
        return image.convert("RGB"), None
    return pipeline_image_to_pil(image)


def zimage_bridge_profiles(torch, resolution: int) -> list[dict[str, Any]]:
    base_size = square_resolution(resolution)
    profiles = [
        {
            "label": "official",
            "dtype": preferred_torch_dtype(torch),
            "guide_size": base_size,
            "cpu_offload": use_cpu_offload_for_bridge(torch),
            "sequential_offload": bridge_needs_extra_conservation(torch),
        }
    ]

    if torch.cuda.is_available():
        stability_size = min(base_size, 384)
        stability_profile = {
            "label": "stability",
            "dtype": torch.float32,
            "guide_size": stability_size,
            "cpu_offload": True,
            "sequential_offload": True,
        }
        if (
            stability_profile["dtype"] != profiles[0]["dtype"]
            or stability_profile["guide_size"] != profiles[0]["guide_size"]
            or stability_profile["cpu_offload"] != profiles[0]["cpu_offload"]
            or stability_profile["sequential_offload"] != profiles[0]["sequential_offload"]
        ):
            profiles.append(stability_profile)

    return profiles


def effective_paint_settings(torch, requested_resolution: int) -> tuple[int, int, int, int]:
    total_memory_gb = gpu_total_vram_gb(torch)
    total_ram_gb = system_total_ram_gb()
    if (total_memory_gb is not None and total_memory_gb <= 16.5) or total_ram_gb <= 32.5:
        if requested_resolution >= 384:
            return 256, 2, 1024, 1024
        return 256, 2, 768, 1024

    if requested_resolution >= 512:
        return 384, 3, 1536, 2048
    if requested_resolution >= 384:
        return 384, 3, 1280, 2048
    return 256, 2, 1024, 1024


def effective_shape_settings(torch, requested_resolution: int) -> tuple[int, int]:
    total_memory_gb = gpu_total_vram_gb(torch)
    total_ram_gb = system_total_ram_gb()

    if (total_memory_gb is not None and total_memory_gb <= 16.5) or total_ram_gb <= 32.5:
        if requested_resolution >= 512:
            return 320, 8000
        return 256, 8000

    if requested_resolution >= 512:
        return 384, 8000
    if requested_resolution >= 384:
        return 320, 8000
    return 256, 8000


def image_has_clean_light_background(image: Image.Image) -> bool:
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0
    top = rgb[0, :, :]
    bottom = rgb[-1, :, :]
    left = rgb[:, 0, :]
    right = rgb[:, -1, :]
    border = np.concatenate([top, bottom, left, right], axis=0)
    border_luminance = border.mean(axis=1)
    return float(border_luminance.mean()) > 0.94 and float(border_luminance.std()) < 0.06


def should_remove_background(image: Image.Image, mode: str) -> bool:
    if image.mode != "RGB":
        return False
    if mode in {"text", "hybrid"}:
        return False
    return not image_has_clean_light_background(image)


def candidate_iso_levels_from_grid(grid_logits) -> list[float]:
    import torch

    finite_mask = torch.isfinite(grid_logits)
    finite_values = grid_logits[finite_mask]
    if finite_values.numel() == 0:
        return []

    finite_min = float(finite_values.min().item())
    finite_max = float(finite_values.max().item())
    sample_step = max(1, int(finite_values.numel() // 400000))
    sample_values = finite_values[::sample_step].detach().float().cpu()

    quantile_points = torch.tensor(
        [0.001, 0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99, 0.999],
        dtype=sample_values.dtype,
    )
    quantiles = torch.quantile(sample_values, quantile_points).tolist()

    preferred_levels = [
        0.0,
        -1.0 / 512.0,
        1.0 / 512.0,
        -0.02,
        0.02,
        -0.05,
        0.05,
    ]
    preferred_levels.extend(float(level) for level in quantiles)
    preferred_levels.extend([finite_min + 1e-4, finite_max - 1e-4])

    deduped: list[float] = []
    seen: set[float] = set()
    for level in preferred_levels:
        rounded = round(float(level), 6)
        if rounded in seen:
            continue
        seen.add(rounded)
        if finite_min < rounded < finite_max:
            deduped.append(rounded)

    deduped.sort(key=lambda value: abs(value))
    return deduped


def extract_mesh_from_grid_logits(
    *,
    grid_logits,
    octree_resolution: int,
    bounds: float,
):
    import torch
    from skimage import measure

    grid_cpu = grid_logits.detach().float().cpu()
    finite_mask = torch.isfinite(grid_cpu)
    finite_count = int(finite_mask.sum().item())
    total_count = int(grid_cpu.numel())
    if finite_count == 0:
        raise RuntimeError("Decoded Hunyuan volume contained no finite values.")

    finite_values = grid_cpu[finite_mask]
    finite_min = float(finite_values.min().item())
    finite_max = float(finite_values.max().item())
    finite_ratio = finite_count / total_count

    sanitized = grid_cpu.numpy()
    mask = np.isfinite(sanitized)
    fill_value = float(finite_values.mean().item())
    sanitized = np.nan_to_num(
        sanitized,
        nan=fill_value,
        posinf=finite_max,
        neginf=finite_min,
    )
    mask_array = mask if not mask.all() else None

    levels = candidate_iso_levels_from_grid(grid_cpu)
    if not levels:
        raise RuntimeError("Decoded Hunyuan volume had no valid iso levels inside the finite range.")

    bbox_min = np.array([-bounds, -bounds, -bounds], dtype=np.float32)
    bbox_max = np.array([bounds, bounds, bounds], dtype=np.float32)
    bbox_size = bbox_max - bbox_min
    grid_size = np.array([octree_resolution + 1, octree_resolution + 1, octree_resolution + 1], dtype=np.float32)

    for level in levels:
        try:
            vertices, faces, _normals, _values = measure.marching_cubes(
                sanitized,
                level,
                method="lewiner",
                mask=mask_array,
            )
            vertices = vertices / grid_size * bbox_size + bbox_min
            mesh = trimesh.Trimesh(vertices.astype(np.float32), np.ascontiguousarray(faces[:, ::-1]))
            return mesh, level, finite_ratio
        except RuntimeError:
            continue

    raise RuntimeError(
        "Hunyuan3D decoded a finite volume, but no extractable surface mesh was found across adaptive iso levels."
    )


def build_shape_attempts(image: Image.Image, mode: str, requested_resolution: int) -> list[dict[str, Any]]:
    seeds = [42, 7, 1234, 2024]
    attempts: list[dict[str, Any]] = [
        {
            "image": image.copy(),
            "seed": seed,
            "label": f"Retrying with diffusion seed {seed}",
            "warning": None,
        }
        for seed in seeds
    ]

    needs_stabilized_variant = mode != "text" or guide_image_needs_repair(image.convert("RGB"))
    if needs_stabilized_variant:
        stabilized = stabilized_shape_reference(
            image,
            min(square_resolution(requested_resolution), 384),
        )
        for seed in (42, 2024):
            attempts.append(
                {
                    "image": stabilized.copy(),
                    "seed": seed,
                    "label": (
                        f"Retrying with a centered clean-background guide image and diffusion seed {seed}"
                    ),
                    "warning": (
                        "x1cad retried shape extraction with a centered clean-background guide image to keep the surface solver stable."
                    ),
                }
            )

    return attempts


def generate_shape_mesh(
    *,
    shape_pipeline,
    image: Image.Image,
    mode: str,
    requested_resolution: int,
    status_path: Path,
    job_id: str,
    started_at: float,
):
    import torch

    box_v = 1.01
    octree_resolution, num_chunks = effective_shape_settings(torch, requested_resolution)
    base_message = (
        "Running prompt-bootstrapped shape diffusion."
        if mode in {"text", "hybrid"}
        else "Running image-guided shape diffusion."
    )
    progress_value = 62 if mode in {"text", "hybrid"} else 42

    shape_attempts = build_shape_attempts(image, mode, requested_resolution)
    total_attempts = len(shape_attempts)
    last_error: Exception | None = None

    for attempt_index, attempt in enumerate(shape_attempts, start=1):
        message = base_message
        if attempt_index > 1:
            message = f"{base_message} {attempt['label']} ({attempt_index}/{total_attempts})."

        progress(
            status_path=status_path,
            job_id=job_id,
            started_at=started_at,
            state="running",
            stage="Generating shape",
            message=message,
            progress_value=progress_value,
        )

        latents = None
        decoded_latents = None
        grid_logits = None
        try:
            latents = shape_pipeline(
                image=attempt["image"],
                generator=build_seeded_generator(torch, attempt["seed"]),
                output_type="latent",
                octree_resolution=octree_resolution,
                num_chunks=num_chunks,
                enable_pbar=False,
            )
            if not torch.isfinite(latents).all():
                cleanup_cuda()
                continue

            decoded_latents = 1.0 / shape_pipeline.vae.scale_factor * latents
            decoded_latents = shape_pipeline.vae(decoded_latents)
            if not torch.isfinite(decoded_latents).all():
                cleanup_cuda()
                continue

            grid_logits = shape_pipeline.vae.volume_decoder(
                decoded_latents,
                shape_pipeline.vae.geo_decoder,
                bounds=box_v,
                num_chunks=num_chunks,
                octree_resolution=octree_resolution,
                enable_pbar=False,
            )
            mesh, used_mc_level, finite_ratio = extract_mesh_from_grid_logits(
                grid_logits=grid_logits[0],
                octree_resolution=octree_resolution,
                bounds=box_v,
            )
        except Exception as exc:
            last_error = exc
            cleanup_cuda()
            continue
        finally:
            if latents is not None:
                del latents
            if decoded_latents is not None:
                del decoded_latents
            if grid_logits is not None:
                del grid_logits
            cleanup_cuda()

        warning = attempt["warning"]
        if finite_ratio < 0.995:
            warning = merge_warnings(
                warning,
                (
                    "Recovered a usable mesh from a partially non-finite Hunyuan field by sanitizing the decoded volume."
                ),
            )
        return mesh, used_mc_level, warning

    raise RuntimeError(
        "Hunyuan3D could not produce a stable finite surface volume from the current guide image after multiple low-memory retries."
        + (f" Last error: {last_error}" if last_error else "")
    )


def materialize_text_or_hybrid_reference(
    *,
    prompt: str,
    mode: str,
    source_image_path: Path | None,
    models_path: Path,
    output_path: Path,
    resolution: int,
    status_path: Path,
    job_id: str,
    started_at: float,
) -> tuple[Path, str | None]:
    import torch

    progress_message = (
        "Loading Z-Image-Turbo to turn the prompt into a clean guide image."
        if mode == "text"
        else "Loading Z-Image-Turbo to refine the reference image with the prompt before shape generation."
    )

    progress(
        status_path=status_path,
        job_id=job_id,
        started_at=started_at,
        state="running",
        stage="Loading guide model",
        message=progress_message,
        progress_value=18,
    )

    model_path = str(models_path / "z-image-turbo")
    guide_warning: str | None = None
    if mode == "hybrid" and source_image_path is None:
        raise ValueError("Hybrid mode requires a source reference image.")

    attempt_plan = (
        [
            (normalize_prompt(prompt), 42, None, "Generating guide image", 30),
            (normalize_prompt(prompt, repair=True), 1337, None, "Repairing guide image", 36),
        ]
        if mode == "text"
        else [
            (normalize_prompt(prompt), 42, 0.6, "Generating guide image", 30),
            (normalize_prompt(prompt, repair=True), 1337, 0.7, "Repairing guide image", 36),
        ]
    )

    last_error: Exception | None = None
    for profile_index, profile in enumerate(zimage_bridge_profiles(torch, resolution), start=1):
        pipeline = None
        try:
            if mode == "text":
                from diffusers import ZImagePipeline

                pipeline = ZImagePipeline.from_pretrained(
                    model_path,
                    torch_dtype=profile["dtype"],
                    low_cpu_mem_usage=True,
                )
            else:
                from diffusers import ZImageImg2ImgPipeline

                pipeline = ZImageImg2ImgPipeline.from_pretrained(
                    model_path,
                    torch_dtype=profile["dtype"],
                    low_cpu_mem_usage=True,
                )

            maybe_enable_flash_attention(pipeline)
            if hasattr(pipeline, "enable_vae_slicing"):
                pipeline.enable_vae_slicing()
            if hasattr(pipeline, "enable_vae_tiling"):
                pipeline.enable_vae_tiling()

            if profile.get("sequential_offload"):
                pipeline.enable_sequential_cpu_offload()
            elif profile["cpu_offload"]:
                pipeline.enable_model_cpu_offload()
            elif torch.cuda.is_available():
                pipeline.to("cuda")

            if hasattr(pipeline, "enable_attention_slicing"):
                pipeline.enable_attention_slicing("max")

            if profile_index > 1:
                guide_warning = merge_warnings(
                    guide_warning,
                    (
                        "x1cad switched Z-Image to a lower-memory stability profile after the first guide image came back invalid."
                    ),
                )

            last_problem: str | None = None
            for attempt_index, (attempt_prompt, seed, strength, stage, progress_value) in enumerate(attempt_plan, start=1):
                progress(
                    status_path=status_path,
                    job_id=job_id,
                    started_at=started_at,
                    state="running",
                    stage=stage,
                    message=(
                        "Synthesizing a guide image from the prompt for Hunyuan3D."
                        if attempt_index == 1 and mode == "text"
                        else "Blending the prompt into the reference image to steer the 3D result."
                        if attempt_index == 1
                        else "The guide image looked unreliable, so x1cad is regenerating a stronger volumetric concept render."
                    ),
                    progress_value=progress_value,
                )

                generator = build_seeded_generator(torch, seed)
                if mode == "text":
                    image_output = pipeline(
                        attempt_prompt,
                        height=profile["guide_size"],
                        width=profile["guide_size"],
                        num_inference_steps=9,
                        guidance_scale=0.0,
                        generator=generator,
                        output_type="pil",
                        max_sequence_length=256,
                    ).images[0]
                else:
                    with Image.open(source_image_path) as raw_reference:
                        init_image = fit_image_to_square(raw_reference, profile["guide_size"]).convert("RGB")
                    image_output = pipeline(
                        attempt_prompt,
                        image=init_image,
                        height=profile["guide_size"],
                        width=profile["guide_size"],
                        strength=strength,
                        num_inference_steps=9,
                        guidance_scale=0.0,
                        generator=generator,
                        output_type="pil",
                        max_sequence_length=256,
                    ).images[0]

                image, output_warning = pipeline_output_to_pil(image_output)
                guide_warning = merge_warnings(guide_warning, output_warning)
                last_problem = guide_image_problem(image)
                if last_problem is None:
                    output_path.parent.mkdir(parents=True, exist_ok=True)
                    image.save(output_path)
                    return output_path, guide_warning

                guide_warning = merge_warnings(
                    guide_warning,
                    (
                        f"x1cad rejected one prompt-bridge image because it looked {last_problem} for stable 3D extraction."
                    ),
                )

            last_error = RuntimeError(
                "Z-Image kept producing unusable guide images"
                f" ({last_problem or 'invalid output'}) even after regeneration."
            )
        except Exception as exc:  # noqa: BLE001
            last_error = exc
        finally:
            if pipeline is not None:
                del pipeline
            cleanup_cuda()

    raise RuntimeError(
        "Z-Image could not produce a stable guide image for Hunyuan3D."
        + (f" Last error: {last_error}" if last_error else "")
    )


def quick_convert_with_obj2gltf(create_glb_with_pbr_materials, obj_path: Path, glb_path: Path) -> None:
    textures = {
        "albedo": str(obj_path).replace(".obj", ".jpg"),
        "metallic": str(obj_path).replace(".obj", "_metallic.jpg"),
        "roughness": str(obj_path).replace(".obj", "_roughness.jpg"),
    }
    create_glb_with_pbr_materials(str(obj_path), textures, str(glb_path))


def main(config_path: Path | None = None) -> None:
    if config_path is None:
        config_path = Path(sys.argv[1]).resolve()
    config = read_json(config_path)
    started_at = monotonic()

    job_id = config["job_id"]
    status_path = Path(config["paths"]["status_path"])
    result_path = Path(config["paths"]["result_path"])
    asset_path = Path(config["paths"]["asset_path"])
    repo_dir = Path(config["paths"]["repo_path"])
    models_path = Path(config["paths"]["models_path"])
    output_dir = Path(config["paths"]["output_dir"])

    apply_hunyuan_runtime_patches(repo_dir)

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
        message="Preparing the local guide image for shape generation.",
        progress_value=8,
    )
    guide_image_path = output_dir / "reference.png"
    original_reference_path: Path | None = None
    if config.get("reference_image"):
        original_reference_path = materialize_reference_image(
            config["reference_image"],
            output_dir / "reference-original.png",
        )

    warning: str | None = None
    mode = config.get("mode", "text")

    if mode == "text":
        if not config.get("text_to_image_enabled", False):
            raise RuntimeError(
                "Prompt-only generation is not available until the prompt bridge model is downloaded."
            )
        reference_image_path, bridge_warning = materialize_text_or_hybrid_reference(
            prompt=config["prompt"],
            mode="text",
            source_image_path=None,
            models_path=models_path,
            output_path=guide_image_path,
            resolution=config["resolution"],
            status_path=status_path,
            job_id=job_id,
            started_at=started_at,
        )
        warning = merge_warnings(warning, bridge_warning)
    elif mode == "hybrid":
        if original_reference_path is None:
            raise RuntimeError("Hybrid generation requires a reference image.")
        if config.get("text_to_image_enabled", False):
            try:
                reference_image_path, bridge_warning = materialize_text_or_hybrid_reference(
                    prompt=config["prompt"],
                    mode="hybrid",
                    source_image_path=original_reference_path,
                    models_path=models_path,
                    output_path=guide_image_path,
                    resolution=config["resolution"],
                    status_path=status_path,
                    job_id=job_id,
                    started_at=started_at,
                )
                warning = merge_warnings(warning, bridge_warning)
            except Exception as exc:  # noqa: BLE001
                try:
                    reference_image_path, bridge_warning = materialize_text_or_hybrid_reference(
                        prompt=config["prompt"],
                        mode="text",
                        source_image_path=None,
                        models_path=models_path,
                        output_path=guide_image_path,
                        resolution=config["resolution"],
                        status_path=status_path,
                        job_id=job_id,
                        started_at=started_at,
                    )
                    warning = merge_warnings(
                        warning,
                        (
                            "Prompt-guided image refinement became unstable, so x1cad switched to a prompt-only guide image "
                            f"to keep the hybrid job moving. Reason: {exc}"
                        ),
                    )
                    warning = merge_warnings(warning, bridge_warning)
                except Exception as text_exc:  # noqa: BLE001
                    reference_image_path = original_reference_path
                    warning = merge_warnings(
                        warning,
                        (
                            "Prompt-guided image refinement could not complete, so x1cad continued with the original reference image. "
                            f"Reason: {exc}. Prompt-only fallback also failed: {text_exc}"
                        ),
                    )
        else:
            reference_image_path = original_reference_path
    else:
        if original_reference_path is None:
            raise RuntimeError("Image-guided generation requires a reference image.")
        reference_image_path = original_reference_path

    try:
        from torchvision_fix import apply_fix

        apply_fix()
    except Exception:  # noqa: BLE001
        pass

    import torch
    from hy3dshape import Hunyuan3DDiTFlowMatchingPipeline
    from hy3dshape.rembg import BackgroundRemover

    image = Image.open(reference_image_path)
    if should_remove_background(image, mode):
        rembg = BackgroundRemover()
        image = rembg(image)
    image = image.convert("RGBA")

    progress(
        status_path=status_path,
        job_id=job_id,
        started_at=started_at,
        state="running",
        stage="Loading shape model",
        message="Loading Hunyuan3D-Shape after the guide stage has been fully unloaded.",
        progress_value=46 if mode in {"text", "hybrid"} else 18,
    )

    try:
        shape_pipeline = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(str(models_path))
    except Exception:
        shape_pipeline = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(str(models_path / "hunyuan3d-dit-v2-1"))

    octree_resolution, _shape_chunks = effective_shape_settings(torch, config["resolution"])
    if octree_resolution < 384:
        warning = merge_warnings(
            warning,
            (
                "x1cad lowered the shape extraction resolution to "
                f"{octree_resolution} to avoid RAM and VRAM paging on this workstation."
            ),
        )

    mesh, used_mc_level, shape_warning = generate_shape_mesh(
        shape_pipeline=shape_pipeline,
        image=image,
        mode=mode,
        requested_resolution=config["resolution"],
        status_path=status_path,
        job_id=job_id,
        started_at=started_at,
    )
    shape_glb_path = output_dir / "shape.glb"
    mesh.export(shape_glb_path)
    warning = merge_warnings(warning, shape_warning)
    if used_mc_level != 0.0:
        warning = merge_warnings(
            warning,
            f"Shape extraction used an adaptive iso level ({used_mc_level:+.2f}) to recover a valid mesh.",
        )
    del image
    del mesh
    del shape_pipeline
    cleanup_cuda()

    final_path = shape_glb_path
    output_mode = "shape"

    if config.get("requested_texture") and not config["generate_texture"]:
        warning = merge_warnings(
            warning,
            (
                "Texture generation was requested, but the local texture pipeline is not ready yet. "
                "x1cad saved the generated shape so you can keep working."
            ),
        )

    if config["generate_texture"] and config.get("texture_pipeline_ready", False):
        try:
            progress(
                status_path=status_path,
                job_id=job_id,
                started_at=started_at,
                state="running",
                stage="Loading paint model",
                message="Shape model unloaded. Loading the PBR paint stage with a VRAM-aware low-memory profile.",
                progress_value=64,
            )

            from textureGenPipeline import Hunyuan3DPaintConfig, Hunyuan3DPaintPipeline
            from hy3dpaint.convert_utils import create_glb_with_pbr_materials
            from hy3dpaint.utils import multiview_utils

            paint_resolution, max_num_view, render_size, texture_size = effective_paint_settings(
                torch,
                config["resolution"],
            )
            if (
                paint_resolution != config["resolution"]
                or max_num_view < 4
                or render_size < 2048
                or texture_size < 4096
            ):
                warning = merge_warnings(
                    warning,
                    (
                        "x1cad lowered the paint stage to "
                        f"{paint_resolution}px across {max_num_view} views with "
                        f"{render_size}px renders and {texture_size}px textures to avoid paging."
                    ),
                )

            paint_config = Hunyuan3DPaintConfig(max_num_view=max_num_view, resolution=paint_resolution)
            paint_config.multiview_pretrained_path = str(models_path)
            paint_config.multiview_cfg_path = str(repo_dir / "hy3dpaint" / "cfgs" / "hunyuan-paint-pbr.yaml")
            paint_config.custom_pipeline = str(repo_dir / "hy3dpaint" / "hunyuanpaintpbr")
            paint_config.realesrgan_ckpt_path = str(repo_dir / "hy3dpaint" / "ckpt" / "RealESRGAN_x4plus.pth")
            paint_config.render_size = render_size
            paint_config.texture_size = texture_size

            original_snapshot_download = multiview_utils.huggingface_hub.snapshot_download

            def local_first_snapshot_download(repo_id, *args, **kwargs):
                local_repo = Path(str(repo_id))
                if local_repo.exists():
                    return str(local_repo)
                return original_snapshot_download(repo_id=repo_id, *args, **kwargs)

            multiview_utils.huggingface_hub.snapshot_download = local_first_snapshot_download
            try:
                paint_pipeline = Hunyuan3DPaintPipeline(paint_config)
            finally:
                multiview_utils.huggingface_hub.snapshot_download = original_snapshot_download

            textured_obj_path = output_dir / "textured.obj"

            progress(
                status_path=status_path,
                job_id=job_id,
                started_at=started_at,
                state="running",
                stage="Painting materials",
                message=(
                    f"Generating multiview PBR textures at {paint_resolution}px across {max_num_view} views, "
                    "then baking them back to the mesh."
                ),
                progress_value=84,
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
            warning = merge_warnings(
                warning,
                (
                    "Texture generation could not complete in the current runtime, so x1cad saved the untextured shape instead. "
                    f"Reason: {exc}"
                ),
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
    config_path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else None
    try:
        main(config_path)
    except Exception as exc:  # noqa: BLE001
        if config_path is not None and config_path.exists():
            config = read_json(config_path)
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
