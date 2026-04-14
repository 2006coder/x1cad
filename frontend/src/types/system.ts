import type { PrimitiveParams, PrimitiveType } from './cad'

export interface MemoryStatus {
  total_gb: number
  available_gb: number
}

export interface CpuStatus {
  name: string
  logical_cores: number
  physical_cores: number | null
}

export interface GpuStatus {
  name: string
  vendor: string
  total_vram_gb: number | null
  free_vram_gb: number | null
  driver_version: string | null
  cuda_available: boolean
  rtx_capable: boolean
}

export type AiMode = 'DISABLED' | 'SHAPE_ONLY' | 'FULL'

export interface AiCapability {
  enabled: boolean
  mode: AiMode
  reason: string
  detected_summary: string
  recommended_output: string
  requirements_url: string
}

export interface SystemStatus {
  app_name: string
  app_version: string
  timestamp: string
  platform: string
  hostname: string
  memory: MemoryStatus
  cpu: CpuStatus
  gpus: GpuStatus[]
  ai_capability: AiCapability
}

export interface ModelStatus {
  shape_model_downloaded: boolean
  paint_model_downloaded: boolean
  total_size_gb: number
  detail: string
}

export interface GenerationRequest {
  prompt: string
  mode: 'text' | 'image' | 'hybrid'
  generate_texture: boolean
  resolution: 256 | 384 | 512
  reference_image?: string | null
}

export interface JobAccepted {
  job_id: string
  accepted_at: string
}

export interface GenerationResult {
  preview_name: string
  summary: string
  vertices: number
  faces: number
  output_mode: 'shape' | 'shape_texture'
  format: 'glb'
  suggested_primitive: PrimitiveType
  suggested_params: PrimitiveParams
  suggested_color: string
}

export interface JobStatus {
  job_id: string
  state: 'queued' | 'running' | 'completed' | 'cancelled'
  progress: number
  stage: string
  elapsed_seconds: number
  eta_seconds: number | null
  vram_gb_used: number | null
  ram_gb_used: number | null
  message: string
  result: GenerationResult | null
}
