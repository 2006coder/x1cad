import type { GenerationResult } from '../types/system'
import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from 'three'
import {
  WORKSPACE_WORKPLANE,
  isMeshObject,
  isPrimitiveObject,
  type PrimitiveDefinition,
  type PrimitiveParams,
  type PrimitiveType,
  type SceneObject,
  type Vector3Tuple,
  type WorkplaneState,
} from '../types/cad'

export const primitiveCatalog: PrimitiveDefinition[] = [
  {
    type: 'box',
    label: 'Box',
    category: 'Core Solids',
    description: 'Precise rectangular solid for architectural and fixture-style modeling.',
    accent: '#7dd3fc',
    defaults: { width: 32, height: 18, depth: 24 },
    fields: [
      { key: 'width', label: 'Width', min: 6, max: 160, step: 1, unit: 'mm' },
      { key: 'height', label: 'Height', min: 6, max: 160, step: 1, unit: 'mm' },
      { key: 'depth', label: 'Depth', min: 6, max: 160, step: 1, unit: 'mm' },
    ],
  },
  {
    type: 'roundedBox',
    label: 'Rounded Box',
    category: 'Core Solids',
    description: 'Chamfer-friendly housing block with live corner radius control.',
    accent: '#5eead4',
    defaults: {
      width: 28,
      height: 16,
      depth: 20,
      cornerRadius: 2.5,
      cornerSegments: 4,
    },
    fields: [
      { key: 'width', label: 'Width', min: 6, max: 160, step: 1, unit: 'mm' },
      { key: 'height', label: 'Height', min: 6, max: 160, step: 1, unit: 'mm' },
      { key: 'depth', label: 'Depth', min: 6, max: 160, step: 1, unit: 'mm' },
      { key: 'cornerRadius', label: 'Corner Radius', min: 0.5, max: 12, step: 0.5, unit: 'mm' },
      { key: 'cornerSegments', label: 'Corner Segments', min: 2, max: 8, step: 1 },
    ],
  },
  {
    type: 'sphere',
    label: 'Sphere',
    category: 'Core Solids',
    description: 'High-fidelity radial primitive with editable tessellation density.',
    accent: '#f9a8d4',
    defaults: { radius: 14, widthSegments: 32, heightSegments: 24 },
    fields: [
      { key: 'radius', label: 'Radius', min: 4, max: 80, step: 1, unit: 'mm' },
      { key: 'widthSegments', label: 'Width Segments', min: 8, max: 96, step: 1 },
      { key: 'heightSegments', label: 'Height Segments', min: 6, max: 72, step: 1 },
    ],
  },
  {
    type: 'cylinder',
    label: 'Cylinder',
    category: 'Mechanical',
    description: 'Parametric cylindrical solid with independent top and bottom radii.',
    accent: '#fdba74',
    defaults: { radiusTop: 10, radiusBottom: 10, height: 26, radialSegments: 28 },
    fields: [
      { key: 'radiusTop', label: 'Top Radius', min: 2, max: 80, step: 1, unit: 'mm' },
      { key: 'radiusBottom', label: 'Bottom Radius', min: 2, max: 80, step: 1, unit: 'mm' },
      { key: 'height', label: 'Height', min: 6, max: 160, step: 1, unit: 'mm' },
      { key: 'radialSegments', label: 'Segments', min: 8, max: 96, step: 1 },
    ],
  },
  {
    type: 'cone',
    label: 'Cone',
    category: 'Mechanical',
    description: 'Tapered solid for guides, nozzles, and silhouette-driven forms.',
    accent: '#fb7185',
    defaults: { radius: 12, height: 28, radialSegments: 28 },
    fields: [
      { key: 'radius', label: 'Base Radius', min: 3, max: 80, step: 1, unit: 'mm' },
      { key: 'height', label: 'Height', min: 6, max: 160, step: 1, unit: 'mm' },
      { key: 'radialSegments', label: 'Segments', min: 8, max: 96, step: 1 },
    ],
  },
  {
    type: 'torus',
    label: 'Torus',
    category: 'Curved',
    description: 'Donut-style profile for rings, seals, cable loops, and round handles.',
    accent: '#c084fc',
    defaults: {
      majorRadius: 14,
      tubeRadius: 4,
      radialSegments: 24,
      tubularSegments: 96,
      arc: 360,
    },
    fields: [
      { key: 'majorRadius', label: 'Major Radius', min: 4, max: 80, step: 1, unit: 'mm' },
      { key: 'tubeRadius', label: 'Tube Radius', min: 1, max: 24, step: 0.5, unit: 'mm' },
      { key: 'radialSegments', label: 'Radial Segments', min: 6, max: 48, step: 1 },
      { key: 'tubularSegments', label: 'Tubular Segments', min: 16, max: 160, step: 1 },
      { key: 'arc', label: 'Arc', min: 45, max: 360, step: 5, unit: 'deg' },
    ],
  },
  {
    type: 'capsule',
    label: 'Capsule',
    category: 'Curved',
    description: 'Rounded industrial primitive ideal for ergonomic or molded geometry.',
    accent: '#818cf8',
    defaults: {
      radius: 8,
      cylinderLength: 18,
      capSegments: 12,
      radialSegments: 24,
    },
    fields: [
      { key: 'radius', label: 'Radius', min: 2, max: 40, step: 0.5, unit: 'mm' },
      { key: 'cylinderLength', label: 'Cylinder Length', min: 6, max: 120, step: 1, unit: 'mm' },
      { key: 'capSegments', label: 'Cap Segments', min: 6, max: 24, step: 1 },
      { key: 'radialSegments', label: 'Radial Segments', min: 6, max: 48, step: 1 },
    ],
  },
  {
    type: 'prism',
    label: 'N-Gon Prism',
    category: 'Polygonal',
    description: 'Fast polygonal prism for fixtures, sockets, and indexed machining forms.',
    accent: '#4ade80',
    defaults: { circumradius: 12, height: 24, sides: 6 },
    fields: [
      { key: 'circumradius', label: 'Circumradius', min: 3, max: 80, step: 1, unit: 'mm' },
      { key: 'height', label: 'Height', min: 6, max: 160, step: 1, unit: 'mm' },
      { key: 'sides', label: 'Sides', min: 3, max: 16, step: 1 },
    ],
  },
  {
    type: 'pyramid',
    label: 'N-Gon Pyramid',
    category: 'Polygonal',
    description: 'Angular tapered primitive for obelisks, jigs, and directional forms.',
    accent: '#facc15',
    defaults: { baseRadius: 13, height: 28, sides: 4 },
    fields: [
      { key: 'baseRadius', label: 'Base Radius', min: 3, max: 80, step: 1, unit: 'mm' },
      { key: 'height', label: 'Height', min: 6, max: 160, step: 1, unit: 'mm' },
      { key: 'sides', label: 'Sides', min: 3, max: 12, step: 1 },
    ],
  },
]

export const primitiveMap = new Map(
  primitiveCatalog.map((primitive) => [primitive.type, primitive] as const),
)

const clampPositive = (value: number, fallback: number) =>
  Number.isFinite(value) && value > 0 ? value : fallback

const worldUp = new Vector3(0, 1, 0)
const worldXAxis = new Vector3(1, 0, 0)
const worldZAxis = new Vector3(0, 0, 1)
const basisMatrix = new Matrix4()
const basisQuaternion = new Quaternion()
const basisEuler = new Euler()

export const getPrimitiveDefinition = (type: PrimitiveType) => primitiveMap.get(type)

export function estimateTriangleCount(type: PrimitiveType, params: PrimitiveParams): number {
  switch (type) {
    case 'box':
      return 12
    case 'roundedBox':
      return Math.round((params.cornerSegments ?? 4) * 56)
    case 'sphere':
      return Math.round(
        clampPositive(params.widthSegments, 24) * clampPositive(params.heightSegments, 18) * 2,
      )
    case 'cylinder':
      return Math.round(clampPositive(params.radialSegments, 24) * 4)
    case 'cone':
      return Math.round(clampPositive(params.radialSegments, 24) * 3)
    case 'torus':
      return Math.round(
        clampPositive(params.radialSegments, 20) *
          clampPositive(params.tubularSegments, 64) *
          2,
      )
    case 'capsule':
      return Math.round(
        clampPositive(params.capSegments, 12) * clampPositive(params.radialSegments, 24) * 4,
      )
    case 'prism':
      return Math.round(clampPositive(params.sides, 6) * 4)
    case 'pyramid':
      return Math.round(clampPositive(params.sides, 4) * 2)
    default:
      return 0
  }
}

export function estimateSceneObjectTriangles(object: SceneObject): number {
  if (isMeshObject(object)) {
    return object.meshFaces ?? 0
  }

  if (isPrimitiveObject(object)) {
    return estimateTriangleCount(object.type, object.params)
  }

  return 0
}

function groundOffset(type: PrimitiveType, params: PrimitiveParams) {
  switch (type) {
    case 'box':
    case 'roundedBox':
    case 'cylinder':
    case 'cone':
    case 'prism':
    case 'pyramid':
      return (params.height ?? 20) / 2
    case 'sphere':
      return params.radius ?? 12
    case 'torus':
      return params.tubeRadius ?? 4
    case 'capsule':
      return (params.cylinderLength ?? 18) / 2 + (params.radius ?? 8)
    default:
      return 10
  }
}

function tupleToVector(tuple: Vector3Tuple) {
  return new Vector3(tuple[0], tuple[1], tuple[2])
}

function vectorToTuple(vector: Vector3): Vector3Tuple {
  return [vector.x, vector.y, vector.z]
}

function resolveWorkplaneBasis(workplane?: WorkplaneState | null) {
  const activeWorkplane = workplane ?? WORKSPACE_WORKPLANE
  const origin = tupleToVector(activeWorkplane.origin)
  const normal = tupleToVector(activeWorkplane.normal)
  if (normal.lengthSq() < 1e-6) {
    normal.copy(worldUp)
  } else {
    normal.normalize()
  }

  let xAxis = tupleToVector(activeWorkplane.xAxis)
  xAxis.addScaledVector(normal, -xAxis.dot(normal))
  if (xAxis.lengthSq() < 1e-6) {
    xAxis = Math.abs(normal.dot(worldXAxis)) < 0.96 ? worldXAxis.clone() : worldZAxis.clone()
    xAxis.addScaledVector(normal, -xAxis.dot(normal))
  }
  xAxis.normalize()

  let zAxis = xAxis.clone().cross(normal)
  if (zAxis.lengthSq() < 1e-6) {
    zAxis = normal.clone().cross(worldZAxis)
  }
  zAxis.normalize()

  xAxis = normal.clone().cross(zAxis).normalize()
  return {
    origin,
    normal,
    xAxis,
    zAxis,
    workplane: {
      ...activeWorkplane,
      origin: vectorToTuple(origin),
      normal: vectorToTuple(normal),
      xAxis: vectorToTuple(xAxis),
    },
  }
}

function placementGrid(existingCount: number, rowOffset: number) {
  const column = existingCount % 3
  const row = Math.floor(existingCount / 3)
  return {
    x: column * 34 - 34,
    z: row * 32 + rowOffset,
  }
}

function rotationFromWorkplane(workplane?: WorkplaneState | null): Vector3Tuple {
  const { normal, xAxis, zAxis } = resolveWorkplaneBasis(workplane)
  basisMatrix.makeBasis(xAxis, normal, zAxis)
  basisQuaternion.setFromRotationMatrix(basisMatrix)
  basisEuler.setFromQuaternion(basisQuaternion, 'XYZ')
  return [
    MathUtils.radToDeg(basisEuler.x),
    MathUtils.radToDeg(basisEuler.y),
    MathUtils.radToDeg(basisEuler.z),
  ]
}

function positionOnWorkplane(
  existingCount: number,
  rowOffset: number,
  normalOffset: number,
  workplane?: WorkplaneState | null,
): Vector3Tuple {
  const { x, z } = placementGrid(existingCount, rowOffset)
  const { origin, normal, xAxis, zAxis } = resolveWorkplaneBasis(workplane)
  const position = origin
    .clone()
    .addScaledVector(xAxis, x)
    .addScaledVector(zAxis, z)
    .addScaledVector(normal, normalOffset)
  return vectorToTuple(position)
}

export function createSceneObject(
  type: PrimitiveType,
  existingCount: number,
  workplane?: WorkplaneState | null,
): SceneObject {
  const definition = primitiveMap.get(type)
  if (!definition) {
    throw new Error(`Unknown primitive type: ${type}`)
  }

  const params = { ...definition.defaults }

  return {
    id: `${type}-${crypto.randomUUID()}`,
    kind: 'primitive',
    type,
    name: `${definition.label} ${existingCount + 1}`,
    color: definition.accent,
    params,
    position: positionOnWorkplane(existingCount, -18, groundOffset(type, params), workplane),
    rotation: rotationFromWorkplane(workplane),
    scale: [1, 1, 1],
    hidden: false,
    locked: false,
    source: 'manual',
  }
}

export function createSceneObjectFromAiResult(
  result: GenerationResult,
  existingCount: number,
  workplane?: WorkplaneState | null,
): SceneObject {
  return {
    id: `generatedMesh-${crypto.randomUUID()}`,
    kind: 'mesh',
    type: 'generatedMesh',
    name: result.preview_name,
    color: result.suggested_color,
    params: {},
    position: positionOnWorkplane(existingCount, 6, 12 + existingCount * 0.2, workplane),
    rotation: rotationFromWorkplane(workplane),
    scale: [1, 1, 1],
    hidden: false,
    locked: false,
    source: 'ai',
    generationPrompt: result.summary,
    meshAssetId: result.artifact_id,
    meshVertices: result.vertices,
    meshFaces: result.faces,
    meshOutputMode: result.output_mode,
    meshWarning: result.warning ?? null,
  }
}

export function createSceneObjectFromAiSuggestion(
  result: GenerationResult,
  existingCount: number,
  workplane?: WorkplaneState | null,
): SceneObject {
  const definition = primitiveMap.get(result.suggested_primitive)
  if (!definition) {
    throw new Error(`Unknown AI suggestion type: ${result.suggested_primitive}`)
  }

  const params = { ...definition.defaults, ...result.suggested_params }

  return {
    id: `${result.suggested_primitive}-${crypto.randomUUID()}`,
    kind: 'primitive',
    type: result.suggested_primitive,
    name: `${result.preview_name} Proxy`,
    color: result.suggested_color,
    params,
    position: positionOnWorkplane(
      existingCount,
      22,
      groundOffset(result.suggested_primitive, params),
      workplane,
    ),
    rotation: rotationFromWorkplane(workplane),
    scale: [1, 1, 1],
    hidden: false,
    locked: false,
    source: 'ai',
    generationPrompt: result.summary,
  }
}

export function buildDemoScene(): SceneObject[] {
  const box = createSceneObject('roundedBox', 0)
  box.name = 'Enclosure'
  box.position = [-28, 10, -10]
  box.params = { ...box.params, width: 42, height: 20, depth: 28, cornerRadius: 3.5 }

  const cylinder = createSceneObject('cylinder', 1)
  cylinder.name = 'Column'
  cylinder.position = [8, 16, -4]
  cylinder.params = { ...cylinder.params, height: 32, radiusTop: 9, radiusBottom: 9 }

  const prism = createSceneObject('prism', 2)
  prism.name = 'Socket'
  prism.position = [38, 11, -8]
  prism.params = { ...prism.params, height: 22, sides: 6, circumradius: 12 }

  const torus = createSceneObject('torus', 3)
  torus.name = 'Seal Ring'
  torus.position = [-8, 4, 28]
  torus.rotation = [90, 0, 0]
  torus.params = { ...torus.params, majorRadius: 15, tubeRadius: 4, tubularSegments: 96 }

  const sphere = createSceneObject('sphere', 4)
  sphere.name = 'Ball Joint'
  sphere.position = [22, 14, 24]
  sphere.params = { ...sphere.params, radius: 14 }

  return [box, cylinder, prism, torus, sphere]
}
