from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.models import GenerationRequest  # noqa: E402
from app.services.ai_runtime import runtime_manager  # noqa: E402
from app.services.system import collect_system_status  # noqa: E402


DEFAULT_PROMPT = "compact desktop enclosure with rounded edges and mounting tabs"


def default_reference_image() -> Path:
    reference = BACKEND_DIR / "data" / "ai" / "smoke-reference.png"
    if reference.exists():
        return reference
    raise FileNotFoundError(
        "No default smoke reference image was found at backend/data/ai/smoke-reference.png. "
        "Pass --reference to specify a local image."
    )


def build_request(
    *,
    mode: str,
    prompt: str,
    resolution: int,
    reference_image: str | None,
    generate_texture: bool,
) -> GenerationRequest:
    return GenerationRequest(
        prompt=prompt,
        mode=mode,  # type: ignore[arg-type]
        generate_texture=generate_texture,
        resolution=resolution,  # type: ignore[arg-type]
        reference_image=reference_image,
    )


def wait_for_completion(job_id: str, *, timeout_seconds: int) -> None:
    started = time.time()
    last_marker: tuple[str, str, int, str | None] | None = None

    while True:
        payload = runtime_manager.get_status(job_id)
        marker = (payload.state, payload.stage, payload.progress, payload.error)
        if marker != last_marker:
            print(
                f"[{job_id}] {payload.state:<9} {payload.stage:<18} "
                f"{payload.progress:>3}% | {payload.message}",
                flush=True,
            )
            last_marker = marker

        if payload.state in {"completed", "failed", "cancelled"}:
            if payload.state != "completed":
                raise RuntimeError(payload.error or payload.message)
            return

        if time.time() - started > timeout_seconds:
            raise TimeoutError(f"Job {job_id} timed out after {timeout_seconds} seconds.")

        time.sleep(5)


def verify_result(label: str, result) -> None:
    if label == "text" and not result.guide_image_url:
        raise RuntimeError("Text smoke completed without a generated guide image.")
    if label == "hybrid" and not result.guide_image_url:
        raise RuntimeError(
            "Hybrid smoke completed without a prompt-generated guide image. The bridge still fell back instead of succeeding."
        )
    if label == "texture" and result.output_mode != "shape_texture":
        raise RuntimeError(
            f"Texture smoke completed without textured output. Warning: {result.warning or 'none'}"
        )


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Run cmd-friendly local smoke tests for x1cad AI generation modes. "
            "This verifies text, image, hybrid, and textured generation paths through the managed runtime."
        )
    )
    parser.add_argument(
        "--modes",
        nargs="+",
        choices=["text", "image", "hybrid", "texture"],
        default=["text", "image", "hybrid", "texture"],
        help="Generation paths to test. 'texture' runs image-to-3D with textures enabled.",
    )
    parser.add_argument(
        "--prompt",
        default=DEFAULT_PROMPT,
        help="Prompt used for the smoke jobs.",
    )
    parser.add_argument(
        "--hybrid-prompt",
        default="compact desktop enclosure with rounded edges and cleaner silhouette",
        help="Prompt used for the hybrid smoke job.",
    )
    parser.add_argument(
        "--reference",
        default=None,
        help="Optional path to a local reference image for image and hybrid tests.",
    )
    parser.add_argument(
        "--resolution",
        type=int,
        choices=[256, 384, 512],
        default=256,
        help="Requested generation resolution.",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=1800,
        help="Per-job timeout in seconds.",
    )
    args = parser.parse_args()

    status = collect_system_status()
    model_status = runtime_manager.status()

    print(f"AI capability: {status.ai_capability.mode}", flush=True)
    print(f"Runtime ready: {model_status.runtime_env_ready}", flush=True)
    print(f"Text supported: {model_status.text_to_3d_supported}", flush=True)
    print(f"Hybrid supported: {model_status.hybrid_supported}", flush=True)
    print(f"Texture ready: {model_status.texture_pipeline_ready}", flush=True)

    if not status.ai_capability.enabled:
        raise RuntimeError(status.ai_capability.reason)
    if not model_status.runtime_env_ready:
        raise RuntimeError("Managed AI runtime is not installed.")
    if not model_status.shape_model_downloaded:
        raise RuntimeError("Shape model is not downloaded.")

    reference_path: Path | None = None
    if any(mode in args.modes for mode in ("image", "hybrid", "texture")):
        reference_path = Path(args.reference).expanduser().resolve() if args.reference else default_reference_image().resolve()
        if not reference_path.exists():
            raise FileNotFoundError(f"Reference image not found: {reference_path}")

    jobs: list[tuple[str, GenerationRequest]] = []
    if "text" in args.modes:
        jobs.append(
            (
                "text",
                build_request(
                    mode="text",
                    prompt=args.prompt,
                    resolution=args.resolution,
                    reference_image=None,
                    generate_texture=False,
                ),
            )
        )
    if "image" in args.modes:
        jobs.append(
            (
                "image",
                build_request(
                    mode="image",
                    prompt=args.prompt,
                    resolution=args.resolution,
                    reference_image=str(reference_path),
                    generate_texture=False,
                ),
            )
        )
    if "hybrid" in args.modes:
        jobs.append(
            (
                "hybrid",
                build_request(
                    mode="hybrid",
                    prompt=args.hybrid_prompt,
                    resolution=args.resolution,
                    reference_image=str(reference_path),
                    generate_texture=False,
                ),
            )
        )
    if "texture" in args.modes:
        jobs.append(
            (
                "texture",
                build_request(
                    mode="image",
                    prompt=args.prompt,
                    resolution=args.resolution,
                    reference_image=str(reference_path),
                    generate_texture=True,
                ),
            )
        )

    for label, request in jobs:
        print(f"\n=== Running {label} smoke ===", flush=True)
        accepted = runtime_manager.create_generation_job(request, status.ai_capability.mode, status)
        print(f"Accepted job: {accepted.job_id}", flush=True)
        wait_for_completion(accepted.job_id, timeout_seconds=args.timeout_seconds)
        result = runtime_manager.get_result(accepted.job_id)
        verify_result(label, result)
        print(
            "Completed:",
            {
                "job_id": accepted.job_id,
                "mode": result.generation_mode,
                "output_mode": result.output_mode,
                "vertices": result.vertices,
                "faces": result.faces,
                "guide_image_url": result.guide_image_url,
                "input_image_url": result.input_image_url,
                "warning": result.warning,
            },
            flush=True,
        )

    print("\nAll requested AI smoke actions completed successfully.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
