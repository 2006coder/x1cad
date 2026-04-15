from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

from hunyuan_repo_patches import WRAPPER_INIT, apply_hunyuan_runtime_patches


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True)
    args = parser.parse_args()

    repo_dir = Path(args.repo)
    source_dir = repo_dir / "hy3dpaint" / "custom_rasterizer"
    kernel_dir = "custom_rasterizer_kernel"
    setup_path = source_dir / "setup_x1cad.py"
    wrapper_init_path = source_dir / "__init__.py"

    apply_hunyuan_runtime_patches(repo_dir)

    setup_path.write_text(
        "\n".join(
            [
                "from setuptools import find_packages, setup",
                "import os",
                "from torch.utils.cpp_extension import BuildExtension, CUDAExtension",
                "",
                "if os.name == 'nt':",
                "    extra_compile_args = {",
                "        'cxx': ['/wd4838', '/D_ALLOW_COMPILER_AND_STL_VERSION_MISMATCH'],",
                "        'nvcc': ['-allow-unsupported-compiler', '-D_ALLOW_COMPILER_AND_STL_VERSION_MISMATCH'],",
                "    }",
                "    build_ext_cls = BuildExtension.with_options(use_ninja=False)",
                "else:",
                "    extra_compile_args = {'cxx': [], 'nvcc': []}",
                "    build_ext_cls = BuildExtension",
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
                "            extra_compile_args=extra_compile_args,",
                "        )",
                "    ],",
                "    cmdclass={'build_ext': build_ext_cls},",
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
        wrapper_init_path.write_text(WRAPPER_INIT, encoding="utf-8")
    finally:
        if setup_path.exists():
            setup_path.unlink()


if __name__ == "__main__":
    main()
