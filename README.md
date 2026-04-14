# x1cad

Local-first browser CAD workspace built from the `instructions.md` brief, with manual CAD as the primary experience and AI generation treated as a secondary capability that unlocks only when the machine supports it.

## Current slice

- Manual CAD workspace with a modern three-panel UI
- Live parametric primitive creation and editing
- Real 3D viewport with orbit controls, transform gizmos, shortcuts, and persisted scene state
- Scene tree with lock/visibility controls and first-run onboarding flow
- Local FastAPI backend for machine capability checks and AI workflow scaffolding
- AI prompt flow with result history and add-to-scene proxy insertion
- Git-backed workflow with production-style checkpoints

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

## Production notes

- The frontend proxies `/api` requests to the local FastAPI backend on port `8000`.
- Scene state is persisted in browser storage so your working set survives refreshes.
- AI panels use detected local hardware and stay disabled when requirements are not met.
- The real Tencent Hunyuan3D repository and model weights are not downloaded yet; the current AI workflow uses local proxy results to keep the CAD integration path functional while the manual CAD engine remains the priority.
