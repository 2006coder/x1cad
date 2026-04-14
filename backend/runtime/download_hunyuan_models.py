from __future__ import annotations

import argparse
from pathlib import Path

from huggingface_hub import snapshot_download


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--include-paint", action="store_true")
    parser.add_argument("--include-zimage", action="store_true")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    allow_patterns = [
        "*.md",
        "*.json",
        "hunyuan3d-dit-v2-1/**",
    ]

    if args.include_paint:
        allow_patterns.append("hunyuan3d-paintpbr-v2-1/**")

    snapshot_download(
        repo_id="tencent/Hunyuan3D-2.1",
        repo_type="model",
        local_dir=str(output_dir),
        local_dir_use_symlinks=False,
        allow_patterns=allow_patterns,
        resume_download=True,
        max_workers=4,
    )

    if args.include_zimage:
        snapshot_download(
            repo_id="Tongyi-MAI/Z-Image-Turbo",
            repo_type="model",
            local_dir=str(output_dir / "z-image-turbo"),
            local_dir_use_symlinks=False,
            resume_download=True,
            max_workers=4,
        )


if __name__ == "__main__":
    main()
