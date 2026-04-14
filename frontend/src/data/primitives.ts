import type { GenerationResult } from '../types/system'
import type { PrimitiveDefinition, PrimitiveParams, PrimitiveType, SceneObject } from '../types/cad'

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

export function createSceneObject(type: PrimitiveType, existingCount: number): SceneObject {
  const definition = primitiveMap.get(type)
  if (!definition) {
    throw new Error(`Unknown primitive type: ${type}`)
  }

  const column = existingCount % 3
  const row = Math.floor(existingCount / 3)
  const x = column * 34 - 34
  const z = row * 32 - 18
  const params = { ...definition.defaults }

  return {
    id: `${type}-${crypto.randomUUID()}`,
    type,
    name: `${definition.label} ${existingCount + 1}`,
    color: definition.accent,
    params,
    position: [x, groundOffset(type, params), z],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    hidden: false,
    locked: false,
    source: 'manual',
  }
}

export function createSceneObjectFromAiResult(
  result: GenerationResult,
  existingCount: number,
): SceneObject {
  const nextObject = createSceneObject(result.suggested_primitive, existingCount)

  return {
    ...nextObject,
    name: result.preview_name,
    color: result.suggested_color,
    params: { ...nextObject.params, ...result.suggested_params },
    position: [0, groundOffset(result.suggested_primitive, result.suggested_params), 0],
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
