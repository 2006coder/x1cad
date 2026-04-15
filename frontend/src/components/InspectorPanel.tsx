import { useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent } from 'react'
import {
  Bot,
  Copy,
  Download,
  Eye,
  EyeOff,
  Focus,
  HardDriveDownload,
  ImagePlus,
  Lock,
  LockOpen,
  RefreshCw,
  Sparkles,
  SquareDashedMousePointer,
  SwatchBook,
  Trash2,
  WandSparkles,
} from 'lucide-react'

import { CollapsibleRailSection } from './CollapsibleRailSection'
import { estimateSceneObjectTriangles, getPrimitiveDefinition } from '../data/primitives'
import { useAiGeneration } from '../hooks/useAiGeneration'
import { useCadStore } from '../store/useCadStore'
import { isMeshObject, isPrimitiveObject, type SceneObject } from '../types/cad'
import type { GenerationRequest, GenerationResult, ModelStatus, SystemStatus } from '../types/system'

const apiBase = import.meta.env.VITE_API_BASE_URL ?? ''

interface InspectorPanelProps {
  selectedObject: SceneObject | null
  systemStatus: SystemStatus
  modelStatus: ModelStatus
  loading: boolean
  error: string | null
  backendOnline: boolean
  refreshStatus: () => Promise<void>
  installRuntime: () => Promise<ModelStatus>
  downloadModels: () => Promise<ModelStatus>
}

const axisLabels = ['X', 'Y', 'Z'] as const

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

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Unable to read the selected image.'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}

function modeWithReference(
  currentMode: GenerationRequest['mode'],
  hybridSupported: boolean,
): GenerationRequest['mode'] {
  if (currentMode !== 'text') {
    return currentMode
  }

  return hybridSupported ? 'hybrid' : 'image'
}

function isImageReferenceText(value: string) {
  const normalized = value.trim()
  return (
    normalized.startsWith('data:image/') ||
    normalized.startsWith('http://') ||
    normalized.startsWith('https://')
  )
}

function resolveApiUrl(path: string | null | undefined) {
  if (!path) {
    return null
  }

  if (path.startsWith('data:') || path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }

  return `${apiBase}${path}`
}

function resultPreviewLabel(result: GenerationResult) {
  if (result.generation_mode === 'text') {
    return 'Prompt guide image'
  }

  if (result.generation_mode === 'hybrid') {
    return 'Prompt-steered guide'
  }

  return 'Reference image'
}

function formatJobMetric(value: number | null | undefined, suffix: string, fallback: string) {
  if (value === null || value === undefined) {
    return fallback
  }

  return `${value}${suffix}`
}

export function InspectorPanel({
  selectedObject,
  systemStatus,
  modelStatus,
  loading,
  error,
  backendOnline,
  refreshStatus,
  installRuntime,
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
  const addGeneratedProxyObject = useCadStore((state) => state.addGeneratedProxyObject)
  const duplicateSelected = useCadStore((state) => state.duplicateSelected)
  const deleteSelected = useCadStore((state) => state.deleteSelected)
  const requestCamera = useCadStore((state) => state.requestCamera)

  const primitiveDefinition =
    selectedObject && isPrimitiveObject(selectedObject)
      ? getPrimitiveDefinition(selectedObject.type)
      : null
  const aiGeneration = useAiGeneration(systemStatus, modelStatus)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [referenceDropActive, setReferenceDropActive] = useState(false)

  const installActionLabel =
    modelStatus.active_operation?.kind === 'install' && modelStatus.active_operation.state === 'running'
      ? 'Installing runtime...'
      : modelStatus.runtime_env_ready
        ? 'Runtime ready'
        : 'Install runtime'

  const downloadActionLabel =
    modelStatus.active_operation?.kind === 'download' && modelStatus.active_operation.state === 'running'
      ? 'Downloading models...'
      : !modelStatus.shape_model_downloaded
        ? 'Download AI stack'
        : !modelStatus.text_to_3d_supported
          ? 'Download prompt bridge'
          : systemStatus.ai_capability.mode === 'FULL' && !modelStatus.paint_model_downloaded
            ? 'Download paint model'
            : 'Models ready'

  const selectionTriangles = selectedObject ? estimateSceneObjectTriangles(selectedObject) : 0
  const currentResult = aiGeneration.jobStatus?.result ?? null
  const generateDisabled =
    !backendOnline ||
    aiGeneration.submitting ||
    aiGeneration.request.prompt.trim().length < 3 ||
    !modelStatus.runtime_env_ready ||
    !modelStatus.shape_model_downloaded ||
    (aiGeneration.request.mode === 'text' && !modelStatus.text_to_3d_supported) ||
    (aiGeneration.request.mode === 'image' && !modelStatus.image_to_3d_supported) ||
    (aiGeneration.request.mode === 'hybrid' && !modelStatus.hybrid_supported) ||
    (aiGeneration.request.mode !== 'text' && !aiGeneration.request.reference_image?.trim())

  const currentResultPreview =
    currentResult && resolveApiUrl(currentResult.guide_image_url ?? currentResult.input_image_url)
  const generationFlowCopy =
    aiGeneration.request.mode === 'text'
      ? 'Prompt -> Z-Image-Turbo guide render -> Hunyuan3D shape generation.'
      : aiGeneration.request.mode === 'hybrid'
        ? 'Prompt + image -> Z-Image-Turbo refinement -> Hunyuan3D shape generation.'
        : 'Upload, paste, or capture an image -> Hunyuan3D shape generation.'

  function applyReferenceImage(referenceImage: string) {
    aiGeneration.setRequest((previous) => ({
      ...previous,
      mode: modeWithReference(previous.mode, modelStatus.hybrid_supported),
      reference_image: referenceImage,
    }))
    aiGeneration.setError(null)
  }

  async function handleReferenceFile(file: File) {
    try {
      const dataUrl = await fileToDataUrl(file)
      applyReferenceImage(dataUrl)
    } catch (fileError) {
      aiGeneration.setError(
        fileError instanceof Error ? fileError.message : 'Unable to read the selected image.',
      )
    }
  }

  async function handleImageFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      await handleReferenceFile(file)
    } catch (fileError) {
      aiGeneration.setError(
        fileError instanceof Error ? fileError.message : 'Unable to read the selected image.',
      )
    } finally {
      event.target.value = ''
    }
  }

  async function captureViewportReference() {
    const canvas = document.querySelector<HTMLCanvasElement>('.viewport-canvas canvas')
    if (!canvas) {
      aiGeneration.setError('Viewport snapshot is unavailable until the scene canvas has loaded.')
      return
    }

    try {
      applyReferenceImage(canvas.toDataURL('image/png'))
    } catch (captureError) {
      aiGeneration.setError(
        captureError instanceof Error
          ? captureError.message
          : 'Unable to capture the current viewport as a reference image.',
      )
    }
  }

  async function applyReferenceText(value: string) {
    if (!isImageReferenceText(value)) {
      aiGeneration.setError('Paste an image URL, data URI, screenshot, or image file.')
      return
    }

    applyReferenceImage(value.trim())
  }

  async function handleReferenceDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setReferenceDropActive(false)

    const file = Array.from(event.dataTransfer.files).find((entry) => entry.type.startsWith('image/'))
    if (file) {
      await handleReferenceFile(file)
      return
    }

    const url = event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text/plain')
    if (url.trim()) {
      await applyReferenceText(url)
    }
  }

  async function handleReferencePaste(event: ClipboardEvent<HTMLDivElement>) {
    const file = Array.from(event.clipboardData.files).find((entry) => entry.type.startsWith('image/'))
    if (file) {
      event.preventDefault()
      await handleReferenceFile(file)
      return
    }

    const text = event.clipboardData.getData('text/plain')
    if (text.trim() && isImageReferenceText(text)) {
      event.preventDefault()
      await applyReferenceText(text)
    }
  }

  return (
    <aside className="inspector panel">
      <CollapsibleRailSection
        badge={selectedObject ? selectedObject.name : 'None'}
        defaultOpen
        icon={SquareDashedMousePointer}
        title="Selection"
      >
        {selectedObject ? (
          <div className="selection-details">
            <div className="selection-header">
              <div>
                <h2>{selectedObject.name}</h2>
                <p>
                  {primitiveDefinition?.description ??
                    'Generated mesh asset loaded from the local AI runtime.'}
                </p>
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
              <span className="info-chip">
                {selectedObject.source === 'ai'
                  ? selectedObject.kind === 'mesh'
                    ? 'AI mesh'
                    : 'AI concept'
                  : 'Manual'}
              </span>
              <button
                className="info-chip info-chip--button"
                onClick={() => toggleObjectVisibility(selectedObject.id)}
                type="button"
              >
                {selectedObject.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                <span>{selectedObject.hidden ? 'Hidden' : 'Visible'}</span>
              </button>
              <button
                className="info-chip info-chip--button"
                onClick={() => toggleObjectLock(selectedObject.id)}
                type="button"
              >
                {selectedObject.locked ? <Lock size={13} /> : <LockOpen size={13} />}
                <span>{selectedObject.locked ? 'Locked' : 'Unlocked'}</span>
              </button>
            </div>

            <div className="button-row">
              <button
                className="secondary-button"
                onClick={() => requestCamera('focusSelected')}
                type="button"
              >
                <Focus size={16} />
                <span>Focus</span>
              </button>
              <button className="secondary-button" onClick={() => duplicateSelected()} type="button">
                <Copy size={16} />
                <span>Duplicate</span>
              </button>
              <button className="secondary-button danger" onClick={() => deleteSelected()} type="button">
                <Trash2 size={16} />
                <span>Delete</span>
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

            {primitiveDefinition ? (
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
            ) : null}

            {isMeshObject(selectedObject) ? (
              <div className="metrics-card">
                <div className="hardware-row">
                  <span>Mesh output</span>
                  <strong>{selectedObject.meshOutputMode === 'shape_texture' ? 'Shape + texture' : 'Shape only'}</strong>
                </div>
                <div className="hardware-row">
                  <span>Vertices</span>
                  <strong>{selectedObject.meshVertices?.toLocaleString() ?? 'n/a'}</strong>
                </div>
                <div className="hardware-row">
                  <span>Faces</span>
                  <strong>{selectedObject.meshFaces?.toLocaleString() ?? 'n/a'}</strong>
                </div>
                {selectedObject.meshWarning ? (
                  <div className="metrics-card__note">{selectedObject.meshWarning}</div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="empty-panel">
            <h2>No object selected</h2>
            <p>Select a primitive in the scene or add one from the left panel to begin editing.</p>
          </div>
        )}
      </CollapsibleRailSection>

      <CollapsibleRailSection
        badge={`${viewMode} view`}
        defaultOpen={false}
        icon={SwatchBook}
        title="Display & Metrics"
      >
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
      </CollapsibleRailSection>

      <CollapsibleRailSection
        badge={systemStatus.ai_capability.enabled ? systemStatus.ai_capability.mode : 'Offline'}
        defaultOpen
        icon={Bot}
        title="AI Studio"
      >
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

          <div className="metrics-card">
            <div className="hardware-row">
              <span>Runtime</span>
              <strong>{modelStatus.runtime_env_ready ? 'Installed' : 'Missing'}</strong>
            </div>
            <div className="hardware-row">
              <span>Runtime Torch</span>
              <strong>{modelStatus.runtime_torch_version ?? 'Unavailable'}</strong>
            </div>
            <div className="hardware-row">
              <span>Shape weights</span>
              <strong>{modelStatus.shape_model_downloaded ? 'Ready' : 'Missing'}</strong>
            </div>
            <div className="hardware-row">
              <span>Texture pipeline</span>
              <strong>
                {modelStatus.texture_pipeline_ready
                  ? 'Ready'
                  : modelStatus.paint_model_downloaded
                    ? 'Build incomplete'
                    : 'Missing'}
              </strong>
            </div>
            <div className="hardware-row">
              <span>Input mode</span>
              <strong>{modelStatus.reference_image_required ? 'Image-guided' : 'Prompt-ready'}</strong>
            </div>
          </div>

          {modelStatus.texture_blocker ? (
            <div className="sidebar-note">{modelStatus.texture_blocker}</div>
          ) : null}

          {modelStatus.active_operation ? (
            <div className="job-card">
              <div className="job-card__header">
                <strong>{modelStatus.active_operation.stage}</strong>
                <span>{modelStatus.active_operation.progress}%</span>
              </div>
              <div className="progress-bar">
                <div style={{ width: `${modelStatus.active_operation.progress}%` }} />
              </div>
              <p>{modelStatus.active_operation.message}</p>
              {modelStatus.active_operation.error ? (
                <p className="inline-error">{modelStatus.active_operation.error}</p>
              ) : null}
            </div>
          ) : null}

          <div className="pill-group">
            <button
              className={`toggle-pill ${aiGeneration.request.mode === 'text' ? 'is-active' : ''}`}
              disabled={!modelStatus.text_to_3d_supported}
              onClick={() =>
                aiGeneration.setRequest((previous) => ({
                  ...previous,
                  mode: 'text',
                }))
              }
              type="button"
            >
              Text
            </button>
            <button
              className={`toggle-pill ${aiGeneration.request.mode === 'image' ? 'is-active' : ''}`}
              disabled={!modelStatus.image_to_3d_supported}
              onClick={() =>
                aiGeneration.setRequest((previous) => ({
                  ...previous,
                  mode: 'image',
                }))
              }
              type="button"
            >
              Image
            </button>
            <button
              className={`toggle-pill ${aiGeneration.request.mode === 'hybrid' ? 'is-active' : ''}`}
              disabled={!modelStatus.hybrid_supported}
              onClick={() =>
                aiGeneration.setRequest((previous) => ({
                  ...previous,
                  mode: 'hybrid',
                }))
              }
              type="button"
            >
              Text + image
            </button>
          </div>

          <div className="ai-flow-card">
            <span className="guide-eyebrow">Current flow</span>
            <p>{generationFlowCopy}</p>
          </div>

          {!modelStatus.text_to_3d_supported ? (
            <div className="sidebar-note">
              Download the prompt bridge to unlock prompt-only generation and true prompt-guided hybrid refinement. Until then, image mode remains fully available.
            </div>
          ) : null}

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

          <div className="reference-card">
            <div className="reference-card__header">
              <span>Reference image</span>
              <div className="button-row">
                <button
                  className="secondary-button"
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  Upload
                </button>
                <button
                  className="secondary-button"
                  onClick={() => void captureViewportReference()}
                  type="button"
                >
                  <ImagePlus size={16} />
                  <span>Use viewport</span>
                </button>
                {aiGeneration.request.reference_image ? (
                  <button
                    className="secondary-button"
                    onClick={() =>
                      aiGeneration.setRequest((previous) => ({
                        ...previous,
                        reference_image: null,
                      }))
                    }
                    type="button"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>

            <input
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={handleImageFile}
              ref={fileInputRef}
              type="file"
            />

            <div
              className={`reference-dropzone ${referenceDropActive ? 'is-dragging' : ''}`}
              onDragEnter={(event) => {
                event.preventDefault()
                setReferenceDropActive(true)
              }}
              onDragLeave={(event) => {
                event.preventDefault()
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setReferenceDropActive(false)
                }
              }}
              onDragOver={(event) => {
                event.preventDefault()
                if (!referenceDropActive) {
                  setReferenceDropActive(true)
                }
              }}
              onDrop={(event) => void handleReferenceDrop(event)}
              onPaste={(event) => void handleReferencePaste(event)}
              tabIndex={0}
            >
              {aiGeneration.request.reference_image ? (
                <img
                  alt="Reference preview"
                  className="reference-preview"
                  src={resolveApiUrl(aiGeneration.request.reference_image) ?? undefined}
                />
              ) : (
                <div className="reference-preview reference-preview--empty">
                  Drop in a sketch, paste a screenshot, or capture the viewport to drive the local shape model. In hybrid mode, x1cad refines the image with your prompt before the 3D pass.
                </div>
              )}
            </div>

            <div className="reference-card__hint">
              <WandSparkles size={14} />
              <span>Tip: paste a screenshot directly into the preview area, or capture the current viewport for hybrid generation.</span>
            </div>

            <label className="text-area-shell">
              <span>Image URL or data URI</span>
              <textarea
                onChange={(event) =>
                  aiGeneration.setRequest((previous) => ({
                    ...previous,
                    mode: event.target.value.trim()
                      ? modeWithReference(previous.mode, modelStatus.hybrid_supported)
                      : previous.mode,
                    reference_image: event.target.value,
                  }))
                }
                placeholder={
                  aiGeneration.request.reference_image?.startsWith('data:image/')
                    ? 'A local upload is already attached. Paste a URL here only if you want to replace it.'
                    : 'Paste an image URL or data URI'
                }
                rows={3}
                value={
                  aiGeneration.request.reference_image?.startsWith('data:image/')
                    ? ''
                    : (aiGeneration.request.reference_image ?? '')
                }
              />
            </label>
          </div>

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
              disabled={systemStatus.ai_capability.mode !== 'FULL' || !modelStatus.texture_pipeline_ready}
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

          {!modelStatus.texture_pipeline_ready && modelStatus.paint_model_downloaded ? (
            <div className="sidebar-note">
              {modelStatus.texture_blocker ??
                'x1cad is keeping texture generation off until the local paint stack is fully ready.'}
            </div>
          ) : null}

          <div className="button-row">
            <button
              className="secondary-button"
              disabled={!backendOnline || loading || modelStatus.runtime_env_ready}
              onClick={() => void installRuntime()}
              type="button"
            >
              <HardDriveDownload size={16} />
              <span>{installActionLabel}</span>
            </button>
            <button
              className="secondary-button"
              disabled={!backendOnline || loading || !modelStatus.runtime_env_ready}
              onClick={() => void downloadModels()}
              type="button"
            >
              <Download size={16} />
              <span>{downloadActionLabel}</span>
            </button>
            <button
              className="primary-button primary-button--wide"
              disabled={generateDisabled}
              onClick={() => void aiGeneration.startGeneration()}
              type="button"
            >
              <Sparkles size={16} />
              <span>{aiGeneration.submitting ? 'Launching...' : 'Generate model'}</span>
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
                <span>
                  ETA {formatJobMetric(aiGeneration.jobStatus.eta_seconds, 's', 'tracking')}
                </span>
                <span>
                  VRAM {formatJobMetric(aiGeneration.jobStatus.vram_gb_used, ' GB', 'sampling')}
                </span>
                <span>
                  RAM {formatJobMetric(aiGeneration.jobStatus.ram_gb_used, ' GB', 'sampling')}
                </span>
              </div>
              {currentResult ? (
                <div className="result-summary result-summary--stacked">
                  <strong>{currentResult.preview_name}</strong>
                  <span>{currentResult.summary}</span>
                  {currentResultPreview ? (
                    <div className="result-preview-card">
                      <span className="guide-eyebrow">{resultPreviewLabel(currentResult)}</span>
                      <img
                        alt={resultPreviewLabel(currentResult)}
                        className="result-preview"
                        src={currentResultPreview}
                      />
                    </div>
                  ) : null}
                  <div className="job-card__metrics">
                    <span>{currentResult.vertices.toLocaleString()} vertices</span>
                    <span>{currentResult.faces.toLocaleString()} faces</span>
                    <span>{currentResult.output_mode === 'shape_texture' ? 'PBR textured' : 'Shape only'}</span>
                  </div>
                  {currentResult.warning ? (
                    <div className="metrics-card__note">{currentResult.warning}</div>
                  ) : null}
                  <div className="button-row">
                    <button
                      className="primary-button"
                      onClick={() => {
                        addGeneratedObject(currentResult)
                        aiGeneration.dismissCurrentResult()
                      }}
                      type="button"
                    >
                      <Sparkles size={16} />
                      <span>Insert mesh</span>
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => {
                        addGeneratedProxyObject(currentResult)
                        aiGeneration.dismissCurrentResult()
                      }}
                      type="button"
                    >
                      Insert proxy
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() =>
                        window.open(
                          resolveApiUrl(currentResult.download_url) ?? currentResult.download_url,
                          '_blank',
                          'noopener,noreferrer',
                        )
                      }
                      type="button"
                    >
                      Download GLB
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
                  <article className="history-item" key={`${item.preview_name}-${item.artifact_id}`}>
                    <div>
                      <strong>{item.preview_name}</strong>
                      <p>{item.summary}</p>
                    </div>
                    {resolveApiUrl(item.guide_image_url ?? item.input_image_url) ? (
                      <div className="result-preview-card">
                        <span className="guide-eyebrow">{resultPreviewLabel(item)}</span>
                        <img
                          alt={resultPreviewLabel(item)}
                          className="result-preview"
                          src={resolveApiUrl(item.guide_image_url ?? item.input_image_url) ?? undefined}
                        />
                      </div>
                    ) : null}
                    <div className="history-item__actions">
                      <button
                        className="secondary-button"
                        onClick={() => addGeneratedObject(item)}
                        type="button"
                      >
                        Insert mesh
                      </button>
                      <button
                        className="secondary-button"
                        onClick={() => addGeneratedProxyObject(item)}
                        type="button"
                      >
                        Insert proxy
                      </button>
                      <button
                        className="secondary-button"
                        onClick={() =>
                          window.open(
                            resolveApiUrl(item.download_url) ?? item.download_url,
                            '_blank',
                            'noopener,noreferrer',
                          )
                        }
                        type="button"
                      >
                        Download
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
      </CollapsibleRailSection>

      <CollapsibleRailSection
        badge={backendOnline ? 'Online' : 'Offline'}
        defaultOpen={false}
        icon={HardDriveDownload}
        title="System"
      >
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
          {modelStatus.notes.map((note) => (
            <div className="sidebar-note" key={note}>
              {note}
            </div>
          ))}
          {error ? <p className="inline-error">{error}</p> : null}
        </div>
      </CollapsibleRailSection>
    </aside>
  )
}
