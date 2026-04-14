import type { ReactNode } from 'react'
import {
  Bot,
  Download,
  Eye,
  EyeOff,
  HardDriveDownload,
  Lock,
  LockOpen,
  RefreshCw,
  Sparkles,
  SquareDashedMousePointer,
  SwatchBook,
} from 'lucide-react'

import { getPrimitiveDefinition, estimateTriangleCount } from '../data/primitives'
import { useAiGeneration } from '../hooks/useAiGeneration'
import { useCadStore } from '../store/useCadStore'
import type { SceneObject } from '../types/cad'
import type { ModelStatus, SystemStatus } from '../types/system'

interface InspectorPanelProps {
  selectedObject: SceneObject | null
  systemStatus: SystemStatus
  modelStatus: ModelStatus
  loading: boolean
  error: string | null
  backendOnline: boolean
  refreshStatus: () => Promise<void>
  downloadModels: () => Promise<ModelStatus>
}

const axisLabels = ['X', 'Y', 'Z'] as const

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof SquareDashedMousePointer
  title: string
  children: ReactNode
}) {
  return (
    <section className="inspector-section">
      <div className="section-heading">
        <Icon size={16} />
        <span>{title}</span>
      </div>
      {children}
    </section>
  )
}

function NumberInput({
  label,
  value,
  step,
  min,
  max,
  unit,
  onChange,
}: {
  label: string
  value: number
  step?: number
  min?: number
  max?: number
  unit?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="input-shell">
      <span>{label}</span>
      <div className="input-shell__control">
        <input
          max={max}
          min={min}
          onChange={(event) => onChange(Number(event.target.value))}
          step={step}
          type="number"
          value={Number.isFinite(value) ? value : 0}
        />
        {unit ? <small>{unit}</small> : null}
      </div>
    </label>
  )
}

export function InspectorPanel({
  selectedObject,
  systemStatus,
  modelStatus,
  loading,
  error,
  backendOnline,
  refreshStatus,
  downloadModels,
}: InspectorPanelProps) {
  const updateObject = useCadStore((state) => state.updateObject)
  const updateObjectParams = useCadStore((state) => state.updateObjectParams)
  const updateVector = useCadStore((state) => state.updateVector)
  const coordinateSpace = useCadStore((state) => state.coordinateSpace)
  const setCoordinateSpace = useCadStore((state) => state.setCoordinateSpace)
  const snapIncrement = useCadStore((state) => state.snapIncrement)
  const setSnapIncrement = useCadStore((state) => state.setSnapIncrement)
  const viewMode = useCadStore((state) => state.viewMode)
  const setViewMode = useCadStore((state) => state.setViewMode)
  const toggleObjectLock = useCadStore((state) => state.toggleObjectLock)
  const toggleObjectVisibility = useCadStore((state) => state.toggleObjectVisibility)
  const addGeneratedObject = useCadStore((state) => state.addGeneratedObject)

  const primitiveDefinition = selectedObject ? getPrimitiveDefinition(selectedObject.type) : null
  const aiGeneration = useAiGeneration(systemStatus, modelStatus)

  const downloadActionLabel =
    modelStatus.shape_model_downloaded && systemStatus.ai_capability.mode === 'FULL'
      ? 'Models ready'
      : modelStatus.shape_model_downloaded
        ? 'Shape model ready'
        : `Download ${modelStatus.total_size_gb.toFixed(0)} GB`

  const selectionTriangles =
    selectedObject ? estimateTriangleCount(selectedObject.type, selectedObject.params) : 0
  const currentResult = aiGeneration.jobStatus?.result ?? null

  return (
    <aside className="inspector panel">
      <Section icon={SquareDashedMousePointer} title="Selection">
        {selectedObject && primitiveDefinition ? (
          <div className="selection-details">
            <div className="selection-header">
              <div>
                <h2>{selectedObject.name}</h2>
                <p>{primitiveDefinition.description}</p>
              </div>
              <input
                aria-label="Object color"
                className="color-input"
                onChange={(event) => updateObject(selectedObject.id, { color: event.target.value })}
                type="color"
                value={selectedObject.color}
              />
            </div>

            <div className="selection-chip-row">
              <span className="info-chip">{selectedObject.source === 'ai' ? 'AI concept' : 'Manual'}</span>
              <button className="info-chip info-chip--button" onClick={() => toggleObjectVisibility(selectedObject.id)} type="button">
                {selectedObject.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                <span>{selectedObject.hidden ? 'Hidden' : 'Visible'}</span>
              </button>
              <button className="info-chip info-chip--button" onClick={() => toggleObjectLock(selectedObject.id)} type="button">
                {selectedObject.locked ? <Lock size={13} /> : <LockOpen size={13} />}
                <span>{selectedObject.locked ? 'Locked' : 'Unlocked'}</span>
              </button>
            </div>

            <div className="vector-group">
              <div className="vector-group__header">
                <span>Transform</span>
                <small>Editable in {coordinateSpace} space</small>
              </div>
              <div className="vector-grid">
                {axisLabels.map((axisLabel, index) => (
                  <NumberInput
                    key={`position-${axisLabel}`}
                    label={`Pos ${axisLabel}`}
                    onChange={(value) => updateVector(selectedObject.id, 'position', index, value)}
                    step={snapIncrement}
                    value={selectedObject.position[index]}
                  />
                ))}
                {axisLabels.map((axisLabel, index) => (
                  <NumberInput
                    key={`rotation-${axisLabel}`}
                    label={`Rot ${axisLabel}`}
                    onChange={(value) => updateVector(selectedObject.id, 'rotation', index, value)}
                    step={1}
                    unit="deg"
                    value={selectedObject.rotation[index]}
                  />
                ))}
                {axisLabels.map((axisLabel, index) => (
                  <NumberInput
                    key={`scale-${axisLabel}`}
                    label={`Scale ${axisLabel}`}
                    min={0.1}
                    onChange={(value) => updateVector(selectedObject.id, 'scale', index, value)}
                    step={0.1}
                    value={selectedObject.scale[index]}
                  />
                ))}
              </div>
            </div>

            <div className="vector-group">
              <div className="vector-group__header">
                <span>Dimensions</span>
                <small>Live parametric controls</small>
              </div>
              <div className="numeric-grid">
                {primitiveDefinition.fields.map((field) => (
                  <NumberInput
                    key={field.key}
                    label={field.label}
                    max={field.max}
                    min={field.min}
                    onChange={(value) =>
                      updateObjectParams(selectedObject.id, { [field.key]: value })
                    }
                    step={field.step}
                    unit={field.unit}
                    value={selectedObject.params[field.key] ?? primitiveDefinition.defaults[field.key]}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="empty-panel">
            <h2>No object selected</h2>
            <p>Select a primitive in the scene or add one from the left panel to begin editing.</p>
          </div>
        )}
      </Section>

      <Section icon={SwatchBook} title="Display & Metrics">
        <div className="precision-grid">
          <div className="pill-group">
            {(['world', 'local'] as const).map((space) => (
              <button
                key={space}
                className={`toggle-pill ${coordinateSpace === space ? 'is-active' : ''}`}
                onClick={() => setCoordinateSpace(space)}
                type="button"
              >
                {space}
              </button>
            ))}
          </div>
          <div className="pill-group">
            {(['shaded', 'wireframe'] as const).map((mode) => (
              <button
                key={mode}
                className={`toggle-pill ${viewMode === mode ? 'is-active' : ''}`}
                onClick={() => setViewMode(mode)}
                type="button"
              >
                {mode}
              </button>
            ))}
          </div>
          <NumberInput
            label="Snap Increment"
            min={0.5}
            onChange={(value) => setSnapIncrement(value)}
            step={0.5}
            unit="mm"
            value={snapIncrement}
          />
          {selectedObject ? (
            <div className="metrics-card">
              <div className="hardware-row">
                <span>Approx. triangles</span>
                <strong>{selectionTriangles.toLocaleString()}</strong>
              </div>
              <div className="hardware-row">
                <span>Source</span>
                <strong>{selectedObject.source === 'ai' ? 'AI-assisted' : 'Manual CAD'}</strong>
              </div>
              {selectedObject.generationPrompt ? (
                <div className="metrics-card__note">{selectedObject.generationPrompt}</div>
              ) : null}
            </div>
          ) : null}
        </div>
      </Section>

      <Section icon={Bot} title="AI Studio">
        <div className="ai-card">
          <div className={`ai-capability-banner ${systemStatus.ai_capability.enabled ? 'ready' : 'locked'}`}>
            <div>
              <span className="guide-eyebrow">Local capability</span>
              <h2>{systemStatus.ai_capability.enabled ? systemStatus.ai_capability.mode : 'DISABLED'}</h2>
              <p>{systemStatus.ai_capability.detected_summary}</p>
            </div>
            <button className="icon-button" onClick={() => void refreshStatus()} type="button">
              <RefreshCw size={16} />
            </button>
          </div>

          <div className="pill-group">
            {[
              ['text', 'Text'],
              ['image', 'Image'],
              ['hybrid', 'Text + image'],
            ].map(([mode, label]) => (
              <button
                key={mode}
                className={`toggle-pill ${aiGeneration.request.mode === mode ? 'is-active' : ''}`}
                onClick={() =>
                  aiGeneration.setRequest((previous) => ({
                    ...previous,
                    mode: mode as 'text' | 'image' | 'hybrid',
                  }))
                }
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          <label className="text-area-shell">
            <span>Prompt</span>
            <textarea
              onChange={(event) =>
                aiGeneration.setRequest((previous) => ({
                  ...previous,
                  prompt: event.target.value,
                }))
              }
              rows={4}
              value={aiGeneration.request.prompt}
            />
          </label>

          {aiGeneration.request.mode !== 'text' ? (
            <label className="text-area-shell">
              <span>Reference image URL or data URI</span>
              <textarea
                onChange={(event) =>
                  aiGeneration.setRequest((previous) => ({
                    ...previous,
                    reference_image: event.target.value,
                  }))
                }
                rows={3}
                value={aiGeneration.request.reference_image ?? ''}
              />
            </label>
          ) : null}

          <div className="pill-group">
            {[256, 384, 512].map((resolution) => (
              <button
                key={resolution}
                className={`toggle-pill ${aiGeneration.request.resolution === resolution ? 'is-active' : ''}`}
                onClick={() =>
                  aiGeneration.setRequest((previous) => ({
                    ...previous,
                    resolution: resolution as 256 | 384 | 512,
                  }))
                }
                type="button"
              >
                {resolution}px
              </button>
            ))}
          </div>

          <div className="pill-group">
            <button
              className={`toggle-pill ${!aiGeneration.request.generate_texture ? 'is-active' : ''}`}
              onClick={() =>
                aiGeneration.setRequest((previous) => ({
                  ...previous,
                  generate_texture: false,
                }))
              }
              type="button"
            >
              Shape only
            </button>
            <button
              className={`toggle-pill ${aiGeneration.request.generate_texture ? 'is-active' : ''}`}
              disabled={systemStatus.ai_capability.mode !== 'FULL'}
              onClick={() =>
                aiGeneration.setRequest((previous) => ({
                  ...previous,
                  generate_texture: true,
                }))
              }
              type="button"
            >
              Shape + texture
            </button>
          </div>

          <div className="button-row">
            <button
              className="secondary-button"
              disabled={!backendOnline || loading || modelStatus.shape_model_downloaded}
              onClick={() => void downloadModels()}
              type="button"
            >
              <Download size={16} />
              <span>{downloadActionLabel}</span>
            </button>
            <button
              className="primary-button primary-button--wide"
              disabled={!backendOnline || aiGeneration.submitting}
              onClick={() => void aiGeneration.startGeneration()}
              type="button"
            >
              <Sparkles size={16} />
              <span>{aiGeneration.submitting ? 'Launching...' : 'Generate preview'}</span>
            </button>
          </div>

          {aiGeneration.jobStatus ? (
            <div className="job-card">
              <div className="job-card__header">
                <strong>{aiGeneration.jobStatus.stage}</strong>
                <span>{aiGeneration.jobStatus.progress}%</span>
              </div>
              <div className="progress-bar">
                <div style={{ width: `${aiGeneration.jobStatus.progress}%` }} />
              </div>
              <p>{aiGeneration.jobStatus.message}</p>
              <div className="job-card__metrics">
                <span>Elapsed {aiGeneration.jobStatus.elapsed_seconds}s</span>
                <span>ETA {aiGeneration.jobStatus.eta_seconds ?? 0}s</span>
                <span>VRAM {aiGeneration.jobStatus.vram_gb_used ?? 0} GB</span>
                <span>RAM {aiGeneration.jobStatus.ram_gb_used ?? 0} GB</span>
              </div>
              {currentResult ? (
                <div className="result-summary result-summary--stacked">
                  <strong>{currentResult.preview_name}</strong>
                  <span>{currentResult.summary}</span>
                  <div className="job-card__metrics">
                    <span>{currentResult.vertices.toLocaleString()} vertices</span>
                    <span>{currentResult.faces.toLocaleString()} faces</span>
                    <span>{currentResult.suggested_primitive}</span>
                  </div>
                  <div className="button-row">
                    <button
                      className="primary-button primary-button--wide"
                      onClick={() => {
                        addGeneratedObject(currentResult)
                        aiGeneration.dismissCurrentResult()
                      }}
                      type="button"
                    >
                      <Sparkles size={16} />
                      <span>Add to scene</span>
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => aiGeneration.reuseResult(currentResult.summary)}
                      type="button"
                    >
                      Reuse prompt
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="secondary-button"
                  onClick={() => void aiGeneration.cancelGeneration()}
                  type="button"
                >
                  Cancel
                </button>
              )}
            </div>
          ) : null}

          {aiGeneration.history.length ? (
            <div className="history-stack">
              <span className="guide-eyebrow">Recent generations</span>
              {aiGeneration.history.map((item) =>
                item ? (
                  <article className="history-item" key={`${item.preview_name}-${item.summary}`}>
                    <div>
                      <strong>{item.preview_name}</strong>
                      <p>{item.summary}</p>
                    </div>
                    <div className="history-item__actions">
                      <button
                        className="secondary-button"
                        onClick={() => addGeneratedObject(item)}
                        type="button"
                      >
                        Insert
                      </button>
                      <button
                        className="secondary-button"
                        onClick={() => aiGeneration.reuseResult(item.summary)}
                        type="button"
                      >
                        Reuse
                      </button>
                    </div>
                  </article>
                ) : null,
              )}
            </div>
          ) : null}

          {aiGeneration.error ? <p className="inline-error">{aiGeneration.error}</p> : null}
        </div>
      </Section>

      <Section icon={HardDriveDownload} title="System">
        <div className="hardware-card">
          <div className="hardware-row">
            <span>Platform</span>
            <strong>{systemStatus.platform}</strong>
          </div>
          <div className="hardware-row">
            <span>Memory</span>
            <strong>
              {systemStatus.memory.available_gb.toFixed(1)} / {systemStatus.memory.total_gb.toFixed(1)} GB free
            </strong>
          </div>
          <div className="hardware-row">
            <span>CPU</span>
            <strong>{systemStatus.cpu.name}</strong>
          </div>
          {systemStatus.gpus.length ? (
            systemStatus.gpus.map((gpu) => (
              <div className="hardware-row" key={gpu.name}>
                <span>{gpu.vendor}</span>
                <strong>
                  {gpu.name}
                  {gpu.total_vram_gb ? ` | ${gpu.total_vram_gb.toFixed(1)} GB` : ''}
                </strong>
              </div>
            ))
          ) : (
            <div className="hardware-row">
              <span>GPU</span>
              <strong>No compatible GPU detected</strong>
            </div>
          )}
          {error ? <p className="inline-error">{error}</p> : null}
        </div>
      </Section>
    </aside>
  )
}
