from __future__ import annotations

import argparse
from pathlib import Path

from hunyuan_repo_patches import apply_hunyuan_runtime_patches


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True)
    args = parser.parse_args()
    apply_hunyuan_runtime_patches(Path(args.repo))


if __name__ == "__main__":
    main()
