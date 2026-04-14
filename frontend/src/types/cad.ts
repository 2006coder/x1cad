export type PrimitiveType =
  | 'box'
  | 'roundedBox'
  | 'sphere'
  | 'cylinder'
  | 'cone'
  | 'torus'
  | 'capsule'
  | 'prism'
  | 'pyramid'

export type ActiveTool = 'select' | 'move' | 'rotate' | 'scale'
export type CoordinateSpace = 'world' | 'local'
export type ViewMode = 'shaded' | 'wireframe'
export type CameraCommand =
  | 'focusSelected'
  | 'focusScene'
  | 'viewTop'
  | 'viewFront'
  | 'viewRight'
  | 'viewIso'

export type Vector3Tuple = [number, number, number]
export type PrimitiveParams = Record<string, number>

export interface ParameterField {
  key: string
  label: string
  min: number
  max: number
  step: number
  unit?: string
}

export interface PrimitiveDefinition {
  type: PrimitiveType
  label: string
  category: string
  description: string
  accent: string
  defaults: PrimitiveParams
  fields: ParameterField[]
}

export interface SceneObject {
  id: string
  type: PrimitiveType
  name: string
  color: string
  params: PrimitiveParams
  position: Vector3Tuple
  rotation: Vector3Tuple
  scale: Vector3Tuple
  hidden: boolean
  locked: boolean
  source: 'manual' | 'ai'
  generationPrompt?: string
}
