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
export type SceneObjectType = PrimitiveType | 'generatedMesh'
export type SceneObjectKind = 'primitive' | 'mesh'

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
  kind: SceneObjectKind
  type: SceneObjectType
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
  meshAssetId?: string
  meshVertices?: number
  meshFaces?: number
  meshOutputMode?: 'shape' | 'shape_texture'
  meshWarning?: string | null
}

export function isPrimitiveObject(object: SceneObject): object is SceneObject & {
  kind: 'primitive'
  type: PrimitiveType
} {
  return object.kind === 'primitive'
}

export function isMeshObject(object: SceneObject): object is SceneObject & {
  kind: 'mesh'
  type: 'generatedMesh'
  meshAssetId: string
} {
  return object.kind === 'mesh' && object.type === 'generatedMesh' && Boolean(object.meshAssetId)
}
