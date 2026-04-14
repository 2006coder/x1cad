import { useCallback, useEffect, useState } from 'react'

import type { ModelStatus, SystemStatus } from '../types/system'

const apiBase = import.meta.env.VITE_API_BASE_URL ?? ''

const fallbackSystemStatus: SystemStatus = {
  app_name: 'x1cad',
  app_version: '0.1.0',
  timestamp: new Date().toISOString(),
  platform: 'Local workstation',
  hostname: 'This PC',
  memory: { total_gb: 32, available_gb: 20.5 },
  cpu: { name: 'Local CPU', logical_cores: 16, physical_cores: 8 },
  gpus: [],
  ai_capability: {
    enabled: false,
    mode: 'DISABLED',
    reason: 'Backend offline. Manual CAD mode remains available.',
    detected_summary: 'System detection is unavailable until the local backend is running.',
    recommended_output: 'Manual CAD only',
    requirements_url: '/docs/ai-requirements',
  },
}

const fallbackModelStatus: ModelStatus = {
  runtime_repo_present: false,
  runtime_env_ready: false,
  shape_model_downloaded: false,
  paint_model_downloaded: false,
  texture_pipeline_ready: false,
  reference_image_required: true,
  text_to_3d_supported: false,
  image_to_3d_supported: false,
  hybrid_supported: false,
  total_size_gb: 12,
  detail: 'Model status becomes available once the local backend is running.',
  repo_path: '',
  env_path: '',
  models_path: '',
  outputs_path: '',
  notes: ['Start the backend to inspect local AI runtime status.'],
  active_operation: null,
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase}${path}`)
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ detail: 'Request failed.' }))
    throw new Error(payload.detail ?? 'Request failed.')
  }

  return (await response.json()) as T
}

export function useSystemStatus() {
  const [systemStatus, setSystemStatus] = useState<SystemStatus>(fallbackSystemStatus)
  const [modelStatus, setModelStatus] = useState<ModelStatus>(fallbackModelStatus)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      const [status, models] = await Promise.all([
        fetchJson<SystemStatus>('/api/system/status'),
        fetchJson<ModelStatus>('/api/ai/models/status'),
      ])
      setSystemStatus(status)
      setModelStatus(models)
      setError(null)
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : 'Unable to reach the local backend.'
      setSystemStatus(fallbackSystemStatus)
      setModelStatus(fallbackModelStatus)
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  const downloadModels = useCallback(async () => {
    const response = await fetch(`${apiBase}/api/ai/models/download`, {
      method: 'POST',
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ detail: 'Download failed.' }))
      throw new Error(payload.detail ?? 'Download failed.')
    }

    const models = (await response.json()) as ModelStatus
    setModelStatus(models)
    return models
  }, [])

  const installRuntime = useCallback(async () => {
    const response = await fetch(`${apiBase}/api/ai/runtime/install`, {
      method: 'POST',
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ detail: 'Runtime install failed.' }))
      throw new Error(payload.detail ?? 'Runtime install failed.')
    }

    const models = (await response.json()) as ModelStatus
    setModelStatus(models)
    return models
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (modelStatus.active_operation?.state !== 'running') {
      return
    }

    const interval = window.setInterval(() => {
      void refresh()
    }, 2500)

    return () => window.clearInterval(interval)
  }, [modelStatus.active_operation?.state, refresh])

  return {
    systemStatus,
    modelStatus,
    loading,
    error,
    refresh,
    installRuntime,
    downloadModels,
    backendOnline: !error,
  }
}
