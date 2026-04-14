from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True)
    args = parser.parse_args()

    repo_dir = Path(args.repo)
    source_dir = repo_dir / "hy3dpaint" / "custom_rasterizer"
    kernel_dir = "custom_rasterizer_kernel_for_windows" if sys.platform == "win32" else "custom_rasterizer_kernel"
    setup_path = source_dir / "setup_x1cad.py"

    setup_path.write_text(
        "\n".join(
            [
                "from setuptools import find_packages, setup",
                "from torch.utils.cpp_extension import BuildExtension, CUDAExtension",
                "",
                "setup(",
                "    packages=find_packages(),",
                "    version='0.1',",
                "    name='custom_rasterizer',",
                "    include_package_data=True,",
                "    package_dir={'': '.'},",
                "    ext_modules=[",
                "        CUDAExtension(",
                "            'custom_rasterizer_kernel',",
                "            [",
                f"                'lib/{kernel_dir}/rasterizer.cpp',",
                f"                'lib/{kernel_dir}/grid_neighbor.cpp',",
                f"                'lib/{kernel_dir}/rasterizer_gpu.cu',",
                "            ],",
                "        )",
                "    ],",
                "    cmdclass={'build_ext': BuildExtension},",
                ")",
            ]
        ),
        encoding="utf-8",
    )

    try:
        subprocess.run(
            [sys.executable, str(setup_path.name), "build_ext", "--inplace"],
            cwd=str(source_dir),
            check=True,
        )
    finally:
        if setup_path.exists():
            setup_path.unlink()


if __name__ == "__main__":
    main()
