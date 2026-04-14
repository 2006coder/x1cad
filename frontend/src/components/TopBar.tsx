import { startTransition } from 'react'
import {
  Boxes,
  Copy,
  Focus,
  Layers3,
  Move3D,
  MousePointer2,
  RotateCw,
  Scale3D,
  Sparkles,
  Trash2,
  WandSparkles,
} from 'lucide-react'

import { useCadStore } from '../store/useCadStore'
import type { ActiveTool } from '../types/cad'
import type { SystemStatus } from '../types/system'

interface TopBarProps {
  systemStatus: SystemStatus
  backendOnline: boolean
}

const toolOptions: { id: ActiveTool; label: string; hotkey: string; icon: typeof MousePointer2 }[] = [
  { id: 'select', label: 'Select', hotkey: 'Q', icon: MousePointer2 },
  { id: 'move', label: 'Move', hotkey: 'G', icon: Move3D },
  { id: 'rotate', label: 'Rotate', hotkey: 'R', icon: RotateCw },
  { id: 'scale', label: 'Scale', hotkey: 'S', icon: Scale3D },
]

export function TopBar({ systemStatus, backendOnline }: TopBarProps) {
  const activeTool = useCadStore((state) => state.activeTool)
  const selectedObjectId = useCadStore((state) => state.selectedObjectId)
  const setActiveTool = useCadStore((state) => state.setActiveTool)
  const duplicateSelected = useCadStore((state) => state.duplicateSelected)
  const deleteSelected = useCadStore((state) => state.deleteSelected)
  const loadDemoScene = useCadStore((state) => state.loadDemoScene)
  const openOnboarding = useCadStore((state) => state.openOnboarding)
  const requestCamera = useCadStore((state) => state.requestCamera)

  const aiModeLabel =
    systemStatus.ai_capability.mode === 'FULL'
      ? 'AI Full'
      : systemStatus.ai_capability.mode === 'SHAPE_ONLY'
        ? 'AI Shape'
        : 'AI Off'

  return (
    <header className="topbar panel">
      <div className="brand-cluster">
        <div className="brand-mark">
          <Boxes size={18} />
        </div>
        <div>
          <div className="eyebrow">CAD-first local workstation</div>
          <div className="brand-title-row">
            <h1>x1cad</h1>
            <span className="build-chip">Browser CAD</span>
          </div>
        </div>
      </div>

      <div className="toolbar">
        <div className="toolbar-group">
          {toolOptions.map(({ id, label, hotkey, icon: Icon }) => (
            <button
              key={id}
              className={`tool-button ${activeTool === id ? 'is-active' : ''}`}
              onClick={() => setActiveTool(id)}
              type="button"
            >
              <Icon size={16} />
              <span>{label}</span>
              <kbd>{hotkey}</kbd>
            </button>
          ))}
        </div>

        <div className="toolbar-group toolbar-group--compact">
          <button className="secondary-button" onClick={() => requestCamera('focusScene')} type="button">
            <Focus size={16} />
            <span>Frame Scene</span>
          </button>
          <button
            className="secondary-button"
            onClick={() => startTransition(() => loadDemoScene())}
            type="button"
          >
            <Layers3 size={16} />
            <span>Reload Demo</span>
          </button>
          <button
            className="secondary-button"
            disabled={!selectedObjectId}
            onClick={() => duplicateSelected()}
            type="button"
          >
            <Copy size={16} />
            <span>Duplicate</span>
          </button>
          <button
            className="secondary-button danger"
            disabled={!selectedObjectId}
            onClick={() => deleteSelected()}
            type="button"
          >
            <Trash2 size={16} />
            <span>Delete</span>
          </button>
        </div>
      </div>

      <div className="topbar-status">
        <button className="status-pill status-pill--button" onClick={() => openOnboarding()} type="button">
          <WandSparkles size={14} />
          <span>Guide</span>
        </button>
        <div className="status-pill">
          <WandSparkles size={14} />
          <span>{aiModeLabel}</span>
        </div>
        <div className={`status-pill ${backendOnline ? 'online' : 'offline'}`}>
          <Sparkles size={14} />
          <span>{backendOnline ? 'Backend online' : 'Offline shell'}</span>
        </div>
      </div>
    </header>
  )
}
