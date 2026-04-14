import { estimateTriangleCount } from '../data/primitives'
import { useCadStore, useSelectedObject } from '../store/useCadStore'
import type { SystemStatus } from '../types/system'

interface StatusBarProps {
  systemStatus: SystemStatus
  backendOnline: boolean
}

export function StatusBar({ systemStatus, backendOnline }: StatusBarProps) {
  const sceneObjects = useCadStore((state) => state.sceneObjects)
  const activeTool = useCadStore((state) => state.activeTool)
  const snapIncrement = useCadStore((state) => state.snapIncrement)
  const selectedObject = useSelectedObject()

  const estimatedTriangles = sceneObjects
    .filter((object) => !object.hidden)
    .reduce((total, object) => total + estimateTriangleCount(object.type, object.params), 0)

  return (
    <footer className="statusbar panel">
      <div className="statusbar__group">
        <span className="statusbar__label">Tool</span>
        <strong>{activeTool}</strong>
      </div>
      <div className="statusbar__group">
        <span className="statusbar__label">Snap</span>
        <strong>{snapIncrement} mm</strong>
      </div>
      <div className="statusbar__group">
        <span className="statusbar__label">Selection</span>
        <strong>{selectedObject?.name ?? 'None'}</strong>
      </div>
      <div className="statusbar__group">
        <span className="statusbar__label">Scene</span>
        <strong>
          {sceneObjects.filter((object) => !object.hidden).length} objects |{' '}
          {estimatedTriangles.toLocaleString()} tris
        </strong>
      </div>
      <div className="statusbar__group">
        <span className="statusbar__label">Memory</span>
        <strong>
          {systemStatus.memory.available_gb.toFixed(1)} / {systemStatus.memory.total_gb.toFixed(1)} GB free
        </strong>
      </div>
      <div className="statusbar__group">
        <span className="statusbar__label">Backend</span>
        <strong>{backendOnline ? systemStatus.hostname : 'Offline shell'}</strong>
      </div>
    </footer>
  )
}
