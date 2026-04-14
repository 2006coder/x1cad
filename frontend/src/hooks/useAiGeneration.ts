import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'

import type {
  GenerationRequest,
  JobAccepted,
  JobStatus,
  ModelStatus,
  SystemStatus,
} from '../types/system'

const apiBase = import.meta.env.VITE_API_BASE_URL ?? ''

const initialRequest: GenerationRequest = {
  prompt: 'Compact desktop enclosure with rounded edges and mounting tabs',
  mode: 'image',
  generate_texture: false,
  resolution: 384,
  reference_image: null,
}

export function useAiGeneration(systemStatus: SystemStatus, modelStatus: ModelStatus) {
  const [request, setRequest] = useState<GenerationRequest>(initialRequest)
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<JobStatus['result'][]>([])
  const completedJobs = useRef(new Set<string>())

  useEffect(() => {
    if (systemStatus.ai_capability.mode !== 'FULL' && request.generate_texture) {
      setRequest((previous) => ({ ...previous, generate_texture: false }))
    }
  }, [request.generate_texture, systemStatus.ai_capability.mode])

  const recordCompletion = useEffectEvent((payload: JobStatus) => {
    if (!payload.result || completedJobs.current.has(payload.job_id)) {
      return
    }

    completedJobs.current.add(payload.job_id)
    setHistory((previous) => [payload.result, ...previous].filter(Boolean).slice(0, 6))
  })

  const startGeneration = useCallback(async () => {
    if (!systemStatus.ai_capability.enabled) {
      setError(systemStatus.ai_capability.reason)
      return
    }

    if (!modelStatus.runtime_env_ready) {
      setError('Install the local Hunyuan runtime before starting generation.')
      return
    }

    if (!modelStatus.shape_model_downloaded) {
      setError('Download the local AI models before starting generation.')
      return
    }

    if (request.mode === 'text' && !modelStatus.text_to_3d_supported) {
      setError('Download the prompt bridge before starting prompt-only generation.')
      return
    }

    if (request.mode === 'hybrid' && !modelStatus.hybrid_supported) {
      setError('Download the prompt bridge before starting prompt-guided hybrid generation.')
      return
    }

    if (request.mode !== 'text' && !request.reference_image?.trim()) {
      setError(
        'Add a reference image, sketch, or viewport screenshot before starting the local Hunyuan pipeline.',
      )
      return
    }

    try {
      setSubmitting(true)
      setError(null)
      setJobStatus(null)

      const response = await fetch(`${apiBase}/api/ai/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ detail: 'Generation failed.' }))
        throw new Error(payload.detail ?? 'Generation failed.')
      }

      const accepted = (await response.json()) as JobAccepted
      setJobStatus({
        job_id: accepted.job_id,
        state: 'queued',
        progress: 0,
        stage: 'Queued',
        elapsed_seconds: 0,
        eta_seconds: null,
        vram_gb_used: null,
        ram_gb_used: null,
        message: 'Job accepted by the local backend.',
        result: null,
        error: null,
      })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Generation failed.')
    } finally {
      setSubmitting(false)
    }
  }, [
    modelStatus.hybrid_supported,
    modelStatus.runtime_env_ready,
    modelStatus.shape_model_downloaded,
    modelStatus.text_to_3d_supported,
    request,
    systemStatus.ai_capability.enabled,
    systemStatus.ai_capability.reason,
  ])

  const cancelGeneration = useCallback(async () => {
    if (!jobStatus) {
      return
    }

    await fetch(`${apiBase}/api/ai/jobs/${jobStatus.job_id}`, {
      method: 'DELETE',
    }).catch(() => undefined)
    setJobStatus(null)
  }, [jobStatus])

  useEffect(() => {
    if (!jobStatus || !['queued', 'running'].includes(jobStatus.state)) {
      return
    }

    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(`${apiBase}/api/ai/jobs/${jobStatus.job_id}/status`)
        if (!response.ok) {
          throw new Error('Unable to refresh generation status.')
        }

        const payload = (await response.json()) as JobStatus
        setJobStatus(payload)
        if (payload.state === 'completed') {
          recordCompletion(payload)
        } else if (payload.state === 'failed') {
          setError(payload.error ?? payload.message)
        }
      } catch (pollError) {
        setError(pollError instanceof Error ? pollError.message : 'Unable to refresh generation.')
        window.clearInterval(interval)
      }
    }, 1000)

    return () => window.clearInterval(interval)
  }, [jobStatus])

  return {
    request,
    setRequest,
    jobStatus,
    submitting,
    error,
    setError,
    history: history.filter(Boolean),
    startGeneration,
    cancelGeneration,
    dismissCurrentResult: () => setJobStatus(null),
    reuseResult: (summary: string) =>
      setRequest((previous) => ({
        ...previous,
        prompt: summary,
      })),
  }
}
