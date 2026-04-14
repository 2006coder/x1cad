# x1cad

Local-first browser CAD workspace built from `instructions.md`, with manual CAD as the primary experience and AI generation integrated as a self-hosted secondary capability on the user’s own PC.

## What is in this build

- Manual CAD workspace with a modern three-panel UI
- Real Three.js viewport with transform gizmos, camera framing, hotkeys, scene tree, lock/visibility controls, and persisted scene state
- Local FastAPI backend for hardware detection and AI runtime orchestration
- Dedicated local Hunyuan runtime manager:
  - installs a separate Python virtual environment
  - clones the official Tencent repository locally
  - downloads model weights into a local cache
  - runs shape and paint stages in sequence
  - unloads each stage after it finishes
- Actual generated GLB assets can be added back into the CAD scene as transformable mesh objects

## AI architecture

x1cad does not rely on Tencent’s demo API server. Instead, it manages the official Hunyuan code directly through its own backend so it can respect the resource budget from `instructions.md`.

Current production path:

1. x1cad backend detects GPU capability.
2. User installs the local AI runtime.
3. User downloads the Hunyuan weights locally.
4. User supplies a reference image, sketch, or concept render.
5. x1cad loads the shape model, generates a mesh, unloads it completely.
6. If texture generation is requested and the native paint extensions are ready, x1cad loads the paint model, textures the mesh, then unloads it completely.
7. The resulting GLB is inserted back into the CAD workspace as a local mesh asset.

## Important current note

The upstream Hunyuan3D 2.1 open workflow is image-guided in this integration. The UI is designed around image or hybrid input right now. Prompt-only generation can be added later through an optional text-to-image bootstrap stage, but it is not the current default path.

## Run locally on this PC

### Backend

```powershell
.\.venv\Scripts\python -m uvicorn app.main:app --app-dir backend --reload
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

## Local AI runtime layout

- Runtime repo: `third_party/Hunyuan3D-2.1`
- Dedicated AI venv: `.ai-venv`
- Local model cache: `backend/data/ai/models`
- Generated assets: `backend/data/ai/outputs`

These paths are intentionally local-only and ignored by git so the repository remains a clean code history while the heavy runtime assets stay on the machine.

## Verification performed

- `npm run build`
- `npm run lint`
- Python compile/import smoke checks for `backend/app` and `backend/runtime`

The optional FastAPI `TestClient` smoke test was not run because the current backend `.venv` does not include `httpx`.
