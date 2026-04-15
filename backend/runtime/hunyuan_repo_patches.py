from __future__ import annotations

from pathlib import Path


WRAPPER_INIT = '''"""x1cad wrapper for Tencent custom_rasterizer package."""
import os
from pathlib import Path
import sys

_MODULE_DIR = Path(__file__).resolve().parent
if str(_MODULE_DIR) not in sys.path:
    sys.path.insert(0, str(_MODULE_DIR))
if hasattr(os, 'add_dll_directory'):
    os.add_dll_directory(str(_MODULE_DIR))
    try:
        import torch
        torch_lib_dir = Path(torch.__file__).resolve().parent / 'lib'
        if torch_lib_dir.exists():
            os.add_dll_directory(str(torch_lib_dir))
    except Exception:
        pass

from .custom_rasterizer import *
'''


def _replace_once(text: str, old: str, new: str, path: Path) -> str:
    if new in text:
        return text
    if old not in text:
        raise RuntimeError(f"Could not find patch target in {path}: {old[:80]!r}")
    return text.replace(old, new)


def _patch_file(path: Path, replacements: list[tuple[str, str]]) -> None:
    text = path.read_text(encoding="utf-8")
    updated = text
    for old, new in replacements:
        updated = _replace_once(updated, old, new, path)
    if updated != text:
        path.write_text(updated, encoding="utf-8")


def apply_hunyuan_runtime_patches(repo_dir: Path) -> None:
    custom_rasterizer_dir = repo_dir / "hy3dpaint" / "custom_rasterizer"
    wrapper_init = custom_rasterizer_dir / "__init__.py"
    current_wrapper = wrapper_init.read_text(encoding="utf-8") if wrapper_init.exists() else None
    if current_wrapper != WRAPPER_INIT:
        wrapper_init.write_text(WRAPPER_INIT, encoding="utf-8")

    _patch_file(
        custom_rasterizer_dir / "lib" / "custom_rasterizer_kernel" / "rasterizer.cpp",
        [
            ("float vt[2] = {px + 0.5, py + 0.5};", "float vt[2] = {px + 0.5f, py + 0.5f};"),
            (
                "auto z_min = torch::ones({height, width}, INT64_options) * (long)maxint;",
                "auto z_min = torch::ones({height, width}, INT64_options) * static_cast<int64_t>(maxint);",
            ),
            ("(INT64*)z_min.data_ptr<long>()", "(INT64*)z_min.data_ptr<int64_t>()"),
        ],
    )

    _patch_file(
        custom_rasterizer_dir / "lib" / "custom_rasterizer_kernel" / "rasterizer_gpu.cu",
        [
            (
                "auto z_min = torch::ones({height, width}, INT64_options) * (long)maxint;",
                "auto z_min = torch::ones({height, width}, INT64_options) * static_cast<int64_t>(maxint);",
            ),
            ("(INT64*)z_min.data_ptr<long>()", "(INT64*)z_min.data_ptr<int64_t>()"),
        ],
    )

    _patch_file(
        custom_rasterizer_dir / "lib" / "custom_rasterizer_kernel" / "grid_neighbor.cpp",
        [
            (
                'printf("Alert! We require 3 layers and at least 1 level! (%d %d)\\n", view_layer_positions.size(), num_level);',
                'printf("Alert! We require 3 layers and at least 1 level! (%zu %d)\\n", view_layer_positions.size(), num_level);',
            ),
            (
                "texture_positions[0] = torch::zeros({seq2pos.size() / 3, 3}, float_options);",
                "texture_positions[0] = torch::zeros({static_cast<int64_t>(seq2pos.size() / 3), 3}, float_options);",
            ),
            (
                "texture_positions[1] = torch::zeros({seq2pos.size() / 3}, float_options);",
                "texture_positions[1] = torch::zeros({static_cast<int64_t>(seq2pos.size() / 3)}, float_options);",
            ),
            (
                "grid_neighbors[i] = torch::zeros({grids[i].seq2grid.size(), 9}, int64_options);",
                "grid_neighbors[i] = torch::zeros({static_cast<int64_t>(grids[i].seq2grid.size()), 9}, int64_options);",
            ),
            ("long* nptr = grid_neighbors[i].data_ptr<long>();", "int64_t* nptr = grid_neighbors[i].data_ptr<int64_t>();"),
            (
                "grid_evencorners[i] = torch::zeros({grids[i].seq2evencorner.size()}, int64_options);",
                "grid_evencorners[i] = torch::zeros({static_cast<int64_t>(grids[i].seq2evencorner.size())}, int64_options);",
            ),
            (
                "grid_oddcorners[i] = torch::zeros({grids[i].seq2oddcorner.size()}, int64_options);",
                "grid_oddcorners[i] = torch::zeros({static_cast<int64_t>(grids[i].seq2oddcorner.size())}, int64_options);",
            ),
            ("long* dptr = grid_evencorners[i].data_ptr<long>();", "int64_t* dptr = grid_evencorners[i].data_ptr<int64_t>();"),
            ("dptr = grid_oddcorners[i].data_ptr<long>();", "dptr = grid_oddcorners[i].data_ptr<int64_t>();"),
            (
                "grid_downsamples[i] = torch::zeros({grids[i].downsample_seq.size()}, int64_options);",
                "grid_downsamples[i] = torch::zeros({static_cast<int64_t>(grids[i].downsample_seq.size())}, int64_options);",
            ),
            ("long* dptr = grid_downsamples[i].data_ptr<long>();", "int64_t* dptr = grid_downsamples[i].data_ptr<int64_t>();"),
            (
                "texture_feats[0] = torch::zeros({seq2feat.size() / feat_channel, feat_channel}, float_options);",
                "texture_feats[0] = torch::zeros({static_cast<int64_t>(seq2feat.size() / feat_channel), feat_channel}, float_options);",
            ),
        ],
    )

    multiview_utils_path = repo_dir / "hy3dpaint" / "utils" / "multiview_utils.py"
    multiview_text = multiview_utils_path.read_text(encoding="utf-8")
    if "EulerAncestralDiscreteScheduler.from_config(" not in multiview_text:
        multiview_text = _replace_once(
            multiview_text,
            '        pipeline.scheduler = UniPCMultistepScheduler.from_config(pipeline.scheduler.config, timestep_spacing="trailing")',
            '        # UniPC mixes CPU scheduler scalars with CUDA tensors on this runtime.\n'
            '        pipeline.scheduler = EulerAncestralDiscreteScheduler.from_config(\n'
            '            pipeline.scheduler.config,\n'
            '            timestep_spacing="trailing",\n'
            '        )',
            multiview_utils_path,
        )
        multiview_utils_path.write_text(multiview_text, encoding="utf-8")

    _patch_file(
        repo_dir / "hy3dpaint" / "convert_utils.py",
        [
            ('    print(f"PBR GLB文件已保存: {output_path}")', '    print(f"PBR GLB saved: {output_path}")'),
        ],
    )
