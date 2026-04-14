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
    source_dir = repo_dir / "hy3dpaint" / "DifferentiableRenderer"
    setup_path = source_dir / "setup_x1cad_mesh_inpaint.py"

    setup_path.write_text(
        "\n".join(
            [
                "from pybind11.setup_helpers import Pybind11Extension, build_ext",
                "from setuptools import setup",
                "",
                "setup(",
                "    name='mesh_inpaint_processor',",
                "    ext_modules=[",
                "        Pybind11Extension(",
                "            'mesh_inpaint_processor',",
                "            ['mesh_inpaint_processor.cpp'],",
                "            cxx_std=14,",
                "        )",
                "    ],",
                "    cmdclass={'build_ext': build_ext},",
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
