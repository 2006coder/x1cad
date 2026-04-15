import {
  useCallback,
  Component,
  Suspense,
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import {
  Bounds,
  ContactShadows,
  Edges,
  Environment,
  Html,
  OrbitControls,
  RoundedBox,
  TransformControls,
  useBounds,
  useGLTF,
} from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl, TransformControls as TransformControlsImpl } from 'three-stdlib'
import {
  Box3,
  Color,
  DoubleSide,
  Group,
  MathUtils,
  Matrix3,
  Matrix4,
  MOUSE,
  Mesh,
  Plane,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
  type Camera,
  type Intersection,
  type Object3D,
} from 'three'
import { Crosshair, Focus, Grid3X3, Move3D, RotateCw, Scale3D } from 'lucide-react'

import { estimateSceneObjectTriangles } from '../data/primitives'
import { useCadStore } from '../store/useCadStore'
import {
  isMeshObject,
  type ActiveTool,
  type CameraCommand,
  type PrimitiveParams,
  type SceneObject,
  type Vector3Tuple,
} from '../types/cad'

const apiBase = import.meta.env.VITE_API_BASE_URL ?? ''
const workplaneDragMime = 'application/x-x1cad-workplane'

const degreesToRadians = (value: number) => (value * Math.PI) / 180
const radiansToDegrees = (value: number) => (value * 180) / Math.PI

const cameraPresetButtons: { label: string; command: CameraCommand }[] = [
  { label: 'Iso', command: 'viewIso' },
  { label: 'Top', command: 'viewTop' },
  { label: 'Front', command: 'viewFront' },
  { label: 'Right', command: 'viewRight' },
]

const viewportToolActions: {
  id: Exclude<ActiveTool, 'select'>
  label: string
  icon: typeof Move3D
}[] = [
  { id: 'move', label: 'Translate', icon: Move3D },
  { id: 'rotate', label: 'Rotate', icon: RotateCw },
  { id: 'scale', label: 'Scale', icon: Scale3D },
]

const transformBounds = new Box3()
const transformCenter = new Vector3()
const workplaneRaycaster = new Raycaster()
const workplanePointer = new Vector2()
const faceNormalMatrix = new Matrix3()
const faceNormal = new Vector3()
const faceXAxis = new Vector3()
const workplaneNormal = new Vector3()
const workplaneXAxis = new Vector3()
const workplaneZAxis = new Vector3()
const workplaneBasis = new Matrix4()
const workplanePlane = new Plane()
const helperQuaternion = new Quaternion()
const fallbackXAxis = new Vector3(1, 0, 0)
const fallbackZAxis = new Vector3(0, 0, 1)
const objectDragHit = new Vector3()
const objectDragAnchor = new Vector3()
const objectDragPosition = new Vector3()
const workspacePlaneSize = 160
const surfacePlaneSize = 48
const orbitMouseDisabled = -1

interface ViewportBridgeState {
  camera: Camera | null
  canvas: HTMLCanvasElement | null
}

interface SurfacePick {
  origin: Vector3Tuple
  normal: Vector3Tuple
  xAxis: Vector3Tuple
  label: string
  objectId: string | null
}

interface ObjectDragState {
  objectId: string
  planarOffset: Vector3
  normalOffset: number
}

function vectorToTuple(vector: Vector3): Vector3Tuple {
  return [vector.x, vector.y, vector.z]
}

function getTargetCenter(target: Group | null) {
  if (!target) {
    return null
  }

  transformBounds.setFromObject(target)
  if (transformBounds.isEmpty()) {
    return null
  }

  return transformBounds.getCenter(transformCenter.clone())
}

function isWorkplaneDrag(event: DragEvent<HTMLElement>) {
  return Array.from(event.dataTransfer.types).includes(workplaneDragMime)
}

function cadSurfaceSource(node: Object3D | null) {
  let current: Object3D | null = node
  while (current) {
    if (current.userData?.cadSurface) {
      return current
    }
    current = current.parent
  }
  return null
}

function buildSurfacePick(intersection: Intersection<Object3D>) {
  const source = cadSurfaceSource(intersection.object)
  if (!(source instanceof Mesh) || !intersection.face) {
    return null
  }

  faceNormalMatrix.getNormalMatrix(source.matrixWorld)
  faceNormal.copy(intersection.face.normal).applyNormalMatrix(faceNormalMatrix).normalize()

  faceXAxis.set(1, 0, 0).applyQuaternion(source.getWorldQuaternion(helperQuaternion))
  faceXAxis.addScaledVector(faceNormal, -faceXAxis.dot(faceNormal))
  if (faceXAxis.lengthSq() < 1e-6) {
    faceXAxis
      .copy(Math.abs(faceNormal.dot(fallbackXAxis)) < 0.96 ? fallbackXAxis : fallbackZAxis)
      .addScaledVector(faceNormal, -faceXAxis.dot(faceNormal))
  }
  faceXAxis.normalize()

  return {
    origin: vectorToTuple(intersection.point.clone()),
    normal: vectorToTuple(faceNormal),
    xAxis: vectorToTuple(faceXAxis),
    label:
      typeof source.userData.cadObjectName === 'string'
        ? `${source.userData.cadObjectName} surface`
        : 'Surface workplane',
    objectId: typeof source.userData.cadObjectId === 'string' ? source.userData.cadObjectId : null,
  } satisfies SurfacePick
}

function ViewportBridge({
  bridgeRef,
}: {
  bridgeRef: MutableRefObject<ViewportBridgeState>
}) {
  const { camera, gl } = useThree()

  useEffect(() => {
    bridgeRef.current = {
      camera,
      canvas: gl.domElement,
    }

    return () => {
      bridgeRef.current = {
        camera: null,
        canvas: null,
      }
    }
  }, [bridgeRef, camera, gl])

  return null
}

const PrimitiveNode = forwardRef<
  Group,
  {
    object: SceneObject
    selected: boolean
    wireframe: boolean
    onSelect: (id: string) => void
    onPointerDown: (object: SceneObject, event: ThreeEvent<PointerEvent>) => void
  }
>(function PrimitiveNode({ object, selected, wireframe, onSelect, onPointerDown }, ref) {
  const materialProps = {
    color: object.color,
    metalness: 0.08,
    roughness: object.source === 'ai' ? 0.28 : 0.36,
    wireframe,
    transparent: object.source === 'ai',
    opacity: object.source === 'ai' ? 0.94 : 1,
    emissive: selected ? object.color : '#000000',
    emissiveIntensity: selected ? 0.22 : object.source === 'ai' ? 0.05 : 0,
  }

  const groupRotation = object.rotation.map(degreesToRadians) as [number, number, number]
  const surfaceUserData = {
    cadSurface: true,
    cadObjectId: object.id,
    cadObjectName: object.name,
  }
  const commonProps = {
    castShadow: true,
    receiveShadow: true,
    userData: surfaceUserData,
    onPointerDown: (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation()
      onPointerDown(object, event)
    },
    onClick: (event: { stopPropagation: () => void }) => {
      event.stopPropagation()
      onSelect(object.id)
    },
  }

  const params = object.params as PrimitiveParams

  return (
    <group ref={ref} position={object.position} rotation={groupRotation} scale={object.scale}>
      {object.type === 'roundedBox' ? (
        <RoundedBox
          args={[params.width ?? 16, params.height ?? 9, params.depth ?? 12]}
          radius={Math.min(params.cornerRadius ?? 1.8, 12)}
          smoothness={Math.round(params.cornerSegments ?? 4)}
          {...commonProps}
        >
          <meshStandardMaterial {...materialProps} />
          {selected && <Edges color="#f8fafc" scale={1.02} />}
        </RoundedBox>
      ) : (
        <mesh {...commonProps}>
          {object.type === 'box' && (
            <boxGeometry args={[params.width ?? 18, params.height ?? 10, params.depth ?? 14]} />
          )}
          {object.type === 'sphere' && (
            <sphereGeometry
              args={[
                params.radius ?? 7,
                Math.round(params.widthSegments ?? 32),
                Math.round(params.heightSegments ?? 24),
              ]}
            />
          )}
          {object.type === 'cylinder' && (
            <cylinderGeometry
              args={[
                params.radiusTop ?? 5.5,
                params.radiusBottom ?? 5.5,
                params.height ?? 14,
                Math.round(params.radialSegments ?? 28),
              ]}
            />
          )}
          {object.type === 'cone' && (
            <coneGeometry
              args={[
                params.radius ?? 6.5,
                params.height ?? 16,
                Math.round(params.radialSegments ?? 28),
              ]}
            />
          )}
          {object.type === 'torus' && (
            <torusGeometry
              args={[
                params.majorRadius ?? 8,
                params.tubeRadius ?? 2.4,
                Math.round(params.radialSegments ?? 24),
                Math.round(params.tubularSegments ?? 96),
                degreesToRadians(params.arc ?? 360),
              ]}
            />
          )}
          {object.type === 'capsule' && (
            <capsuleGeometry
              args={[
                params.radius ?? 4.5,
                params.cylinderLength ?? 10,
                Math.round(params.capSegments ?? 12),
                Math.round(params.radialSegments ?? 24),
              ]}
            />
          )}
          {object.type === 'prism' && (
            <cylinderGeometry
              args={[
                params.circumradius ?? 7,
                params.circumradius ?? 7,
                params.height ?? 14,
                Math.max(3, Math.round(params.sides ?? 6)),
              ]}
            />
          )}
          {object.type === 'pyramid' && (
            <cylinderGeometry
              args={[
                0,
                params.baseRadius ?? 7.5,
                params.height ?? 16,
                Math.max(3, Math.round(params.sides ?? 4)),
              ]}
            />
          )}
          <meshStandardMaterial {...materialProps} />
          {selected && <Edges color="#f8fafc" scale={1.02} />}
        </mesh>
      )}

      {selected && (
        <Html position={[0, 18, 0]} center distanceFactor={9}>
          <div className={`selection-tag ${object.source === 'ai' ? 'selection-tag--ai' : ''}`}>
            {object.name}
          </div>
        </Html>
      )}
    </group>
  )
})

class MeshLoadBoundary extends Component<
  {
    object: SceneObject & { kind: 'mesh'; type: 'generatedMesh'; meshAssetId: string }
    selected: boolean
    wireframe: boolean
    onSelect: (id: string) => void
    children: React.ReactNode
  },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override componentDidCatch(error: Error) {
    console.error(`Unable to load mesh asset ${this.props.object.meshAssetId}`, error)
  }

  override componentDidUpdate(
    prevProps: Readonly<{
      object: SceneObject & { kind: 'mesh'; type: 'generatedMesh'; meshAssetId: string }
      selected: boolean
      wireframe: boolean
      onSelect: (id: string) => void
      children: React.ReactNode
    }>,
  ) {
    if (
      this.state.failed &&
      (prevProps.object.id !== this.props.object.id ||
        prevProps.object.meshAssetId !== this.props.object.meshAssetId)
    ) {
      this.setState({ failed: false })
    }
  }

  override render() {
    if (this.state.failed) {
      const { object, onSelect, selected, wireframe } = this.props
      const groupRotation = object.rotation.map(degreesToRadians) as [number, number, number]

      return (
        <group
          position={object.position}
          rotation={groupRotation}
          scale={object.scale}
          onClick={(event) => {
            event.stopPropagation()
            onSelect(object.id)
          }}
        >
          <mesh castShadow receiveShadow userData={{ cadSurface: true, cadObjectId: object.id, cadObjectName: object.name }}>
            <boxGeometry args={[22, 22, 22]} />
            <meshStandardMaterial
              color={object.color}
              emissive={selected ? object.color : '#000000'}
              emissiveIntensity={selected ? 0.18 : 0}
              metalness={0.04}
              opacity={0.5}
              roughness={0.52}
              transparent
              wireframe={wireframe}
            />
            {selected ? <Edges color="#f8fafc" scale={1.02} /> : null}
          </mesh>
          <Html position={[0, 18, 0]} center distanceFactor={9}>
            <div className="selection-tag selection-tag--warning">{object.name} unavailable</div>
          </Html>
        </group>
      )
    }

    return this.props.children
  }
}

const GeneratedMeshNode = forwardRef<
  Group,
  {
    object: SceneObject & { kind: 'mesh'; type: 'generatedMesh'; meshAssetId: string }
    selected: boolean
    wireframe: boolean
    onSelect: (id: string) => void
    onPointerDown: (object: SceneObject, event: ThreeEvent<PointerEvent>) => void
  }
>(function GeneratedMeshNode({ object, selected, wireframe, onSelect, onPointerDown }, ref) {
  const assetUrl = `${apiBase}/api/ai/assets/${object.meshAssetId}`
  const gltf = useGLTF(assetUrl)
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true)
    clone.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true
        child.receiveShadow = true
        child.userData = {
          ...child.userData,
          cadSurface: true,
          cadObjectId: object.id,
          cadObjectName: object.name,
        }
        if (Array.isArray(child.material)) {
          child.material = child.material.map((material) => material.clone())
        } else if (child.material) {
          child.material = child.material.clone()
        }
      }
    })
    return clone
  }, [gltf.scene, object.id, object.name])

  useEffect(() => {
    scene.traverse((child) => {
      if (!(child instanceof Mesh)) {
        return
      }

      child.userData = {
        ...child.userData,
        cadSurface: true,
        cadObjectId: object.id,
        cadObjectName: object.name,
      }

      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach((material) => {
        if (!material) {
          return
        }

        if ('wireframe' in material) {
          material.wireframe = wireframe
        }

        if ('transparent' in material) {
          material.transparent = true
        }

        if ('opacity' in material) {
          material.opacity = 0.97
        }

        if ('emissive' in material) {
          material.emissive = new Color(selected ? object.color : '#000000')
          material.emissiveIntensity = selected ? 0.14 : 0
        }
      })
    })
  }, [object.color, object.id, object.name, scene, selected, wireframe])

  const groupRotation = object.rotation.map(degreesToRadians) as [number, number, number]

  return (
    <group
      ref={ref}
      position={object.position}
      rotation={groupRotation}
      scale={object.scale}
      onPointerDown={(event) => {
        event.stopPropagation()
        onPointerDown(object, event)
      }}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(object.id)
      }}
    >
      <primitive object={scene} />
      {selected && (
        <Html position={[0, 24, 0]} center distanceFactor={9}>
          <div className={`selection-tag ${object.source === 'ai' ? 'selection-tag--ai' : ''}`}>
            {object.name}
          </div>
        </Html>
      )}
    </group>
  )
})

const SceneObjectNode = forwardRef<
  Group,
  {
    object: SceneObject
    selected: boolean
    wireframe: boolean
    onSelect: (id: string) => void
    onPointerDown: (object: SceneObject, event: ThreeEvent<PointerEvent>) => void
  }
>(function SceneObjectNode({ object, selected, wireframe, onSelect, onPointerDown }, ref) {
  if (isMeshObject(object)) {
    return (
      <MeshLoadBoundary object={object} onSelect={onSelect} selected={selected} wireframe={wireframe}>
        <GeneratedMeshNode
          ref={ref}
          object={object}
          onPointerDown={onPointerDown}
          onSelect={onSelect}
          selected={selected}
          wireframe={wireframe}
        />
      </MeshLoadBoundary>
    )
  }

  return (
    <PrimitiveNode
      ref={ref}
      object={object}
      onPointerDown={onPointerDown}
      onSelect={onSelect}
      selected={selected}
      wireframe={wireframe}
    />
  )
})

function CameraDirector({
  cameraRequestToken,
  cameraRequestKind,
  orbitRef,
  sceneRef,
  selectedRef,
}: {
  cameraRequestToken: number
  cameraRequestKind: CameraCommand
  orbitRef: RefObject<OrbitControlsImpl | null>
  sceneRef: RefObject<Group | null>
  selectedRef: RefObject<Group | null>
}) {
  const bounds = useBounds()

  useEffect(() => {
    if (!cameraRequestToken) {
      return
    }

    const targetObject =
      cameraRequestKind === 'focusScene' ? sceneRef.current : selectedRef.current ?? sceneRef.current

    if (!targetObject) {
      return
    }

    if (cameraRequestKind === 'focusSelected' || cameraRequestKind === 'focusScene') {
      bounds.refresh(targetObject).fit()
      return
    }

    const center = getTargetCenter(targetObject)
    if (!center || !orbitRef.current) {
      return
    }

    const orbit = orbitRef.current
    orbit.target.copy(center)

    if (cameraRequestKind === 'viewTop') {
      orbit.object.position.set(center.x, center.y + 92, center.z + 0.001)
    } else if (cameraRequestKind === 'viewFront') {
      orbit.object.position.set(center.x, center.y + 24, center.z + 92)
    } else if (cameraRequestKind === 'viewRight') {
      orbit.object.position.set(center.x + 92, center.y + 24, center.z)
    } else {
      orbit.object.position.set(center.x + 66, center.y + 42, center.z + 66)
    }

    orbit.object.lookAt(center)
    orbit.update()
  }, [bounds, cameraRequestKind, cameraRequestToken, orbitRef, sceneRef, selectedRef])

  return null
}

export function SceneViewport() {
  const sceneObjects = useCadStore((state) => state.sceneObjects)
  const selectedObjectId = useCadStore((state) => state.selectedObjectId)
  const activeTool = useCadStore((state) => state.activeTool)
  const coordinateSpace = useCadStore((state) => state.coordinateSpace)
  const snapIncrement = useCadStore((state) => state.snapIncrement)
  const viewMode = useCadStore((state) => state.viewMode)
  const workplane = useCadStore((state) => state.workplane)
  const workplanePlacementActive = useCadStore((state) => state.workplanePlacementActive)
  const showOnboarding = useCadStore((state) => state.showOnboarding)
  const dismissOnboarding = useCadStore((state) => state.dismissOnboarding)
  const cameraRequest = useCadStore((state) => state.cameraRequest)
  const selectObject = useCadStore((state) => state.selectObject)
  const setActiveTool = useCadStore((state) => state.setActiveTool)
  const requestCamera = useCadStore((state) => state.requestCamera)
  const updateObject = useCadStore((state) => state.updateObject)
  const armWorkplanePlacement = useCadStore((state) => state.armWorkplanePlacement)
  const cancelWorkplanePlacement = useCadStore((state) => state.cancelWorkplanePlacement)
  const setSurfaceWorkplane = useCadStore((state) => state.setSurfaceWorkplane)

  const orbitRef = useRef<OrbitControlsImpl | null>(null)
  const transformRef = useRef<TransformControlsImpl | null>(null)
  const sceneRef = useRef<Group | null>(null)
  const selectedRef = useRef<Group | null>(null)
  const viewportBridgeRef = useRef<ViewportBridgeState>({ camera: null, canvas: null })
  const objectDragRef = useRef<ObjectDragState | null>(null)
  const [workplaneDropActive, setWorkplaneDropActive] = useState(false)
  const [shiftPanEnabled, setShiftPanEnabled] = useState(false)

  const visibleObjects = useMemo(
    () => sceneObjects.filter((object) => !object.hidden),
    [sceneObjects],
  )

  const selectedObject = sceneObjects.find((object) => object.id === selectedObjectId) ?? null
  const selectedObjectVisible = selectedObject && !selectedObject.hidden ? selectedObject : null
  const estimatedTriangles = visibleObjects.reduce(
    (total, object) => total + estimateSceneObjectTriangles(object),
    0,
  )

  const transformEnabled =
    !!selectedObjectVisible &&
    !selectedObjectVisible.locked &&
    !workplanePlacementActive
  const transformMode =
    activeTool === 'rotate' ? 'rotate' : activeTool === 'scale' ? 'scale' : 'translate'
  const workplaneLabel =
    workplane.mode === 'surface' ? workplane.label || 'Surface workplane' : 'Workspace plane'
  const activePlaneSize = workplane.mode === 'surface' ? surfacePlaneSize : workspacePlaneSize
  const activePlaneDivisions = workplane.mode === 'surface' ? 24 : 80
  const activePlaneColor = workplane.mode === 'surface' ? '#facc15' : '#2dd4bf'
  const activeGridColor = workplane.mode === 'surface' ? '#f59e0b' : '#163447'
  const activePlaneOpacity = workplane.mode === 'surface' ? 0.2 : 0.06
  const workplaneOrigin = useMemo(() => new Vector3(...workplane.origin), [workplane.origin])
  const workplaneUnitNormal = useMemo(() => {
    const nextNormal = new Vector3(...workplane.normal)
    if (nextNormal.lengthSq() < 1e-6) {
      nextNormal.set(0, 1, 0)
    } else {
      nextNormal.normalize()
    }
    return nextNormal
  }, [workplane.normal])
  const workplaneQuaternion = useMemo(() => {
    workplaneNormal.set(...workplane.normal)
    if (workplaneNormal.lengthSq() < 1e-6) {
      workplaneNormal.set(0, 1, 0)
    } else {
      workplaneNormal.normalize()
    }

    workplaneXAxis.set(...workplane.xAxis)
    workplaneXAxis.addScaledVector(workplaneNormal, -workplaneXAxis.dot(workplaneNormal))
    if (workplaneXAxis.lengthSq() < 1e-6) {
      workplaneXAxis.copy(
        Math.abs(workplaneNormal.dot(fallbackXAxis)) < 0.96 ? fallbackXAxis : fallbackZAxis,
      )
      workplaneXAxis.addScaledVector(workplaneNormal, -workplaneXAxis.dot(workplaneNormal))
    }
    workplaneXAxis.normalize()
    workplaneZAxis.copy(workplaneXAxis).cross(workplaneNormal).normalize()
    workplaneXAxis.copy(workplaneNormal).cross(workplaneZAxis).normalize()
    workplaneBasis.makeBasis(workplaneXAxis, workplaneNormal, workplaneZAxis)
    return new Quaternion().setFromRotationMatrix(workplaneBasis)
  }, [workplane])

  function pickSurfaceAtClientPoint(clientX: number, clientY: number) {
    const { camera, canvas } = viewportBridgeRef.current
    if (!camera || !canvas || !sceneRef.current) {
      return null
    }

    const bounds = canvas.getBoundingClientRect()
    if (!bounds.width || !bounds.height) {
      return null
    }

    workplanePointer.x = ((clientX - bounds.left) / bounds.width) * 2 - 1
    workplanePointer.y = -(((clientY - bounds.top) / bounds.height) * 2 - 1)
    workplaneRaycaster.setFromCamera(workplanePointer, camera)

    for (const intersection of workplaneRaycaster.intersectObjects(sceneRef.current.children, true)) {
      const pick = buildSurfacePick(intersection)
      if (pick) {
        return pick
      }
    }

    return null
  }

  const pointOnActiveWorkplane = useCallback((clientX: number, clientY: number) => {
    const { camera, canvas } = viewportBridgeRef.current
    if (!camera || !canvas) {
      return null
    }

    const bounds = canvas.getBoundingClientRect()
    if (!bounds.width || !bounds.height) {
      return null
    }

    workplanePointer.x = ((clientX - bounds.left) / bounds.width) * 2 - 1
    workplanePointer.y = -(((clientY - bounds.top) / bounds.height) * 2 - 1)
    workplaneRaycaster.setFromCamera(workplanePointer, camera)
    workplanePlane.setFromNormalAndCoplanarPoint(workplaneUnitNormal, workplaneOrigin)

    if (!workplaneRaycaster.ray.intersectPlane(workplanePlane, objectDragHit)) {
      return null
    }

    return objectDragHit.clone()
  }, [workplaneOrigin, workplaneUnitNormal])

  function commitSurfacePick(pick: SurfacePick) {
    setSurfaceWorkplane({
      origin: pick.origin,
      normal: pick.normal,
      xAxis: pick.xAxis,
      label: pick.label,
    })
    if (pick.objectId) {
      selectObject(pick.objectId)
    }
  }

  function handleViewportDrop(event: DragEvent<HTMLElement>) {
    if (!isWorkplaneDrag(event)) {
      return
    }

    event.preventDefault()
    setWorkplaneDropActive(false)
    const pick = pickSurfaceAtClientPoint(event.clientX, event.clientY)
    if (pick) {
      commitSurfacePick(pick)
      return
    }

    armWorkplanePlacement()
  }

  function handleViewportPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!workplanePlacementActive) {
      return
    }

    const pick = pickSurfaceAtClientPoint(event.clientX, event.clientY)
    if (!pick) {
      return
    }

    event.preventDefault()
    commitSurfacePick(pick)
  }

  function handleObjectPointerDown(object: SceneObject, event: ThreeEvent<PointerEvent>) {
    if (
      workplanePlacementActive ||
      object.locked ||
      event.button !== 0 ||
      event.shiftKey ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return
    }

    selectObject(object.id)
    if (selectedObjectId !== object.id || activeTool === 'rotate' || activeTool === 'scale') {
      return
    }

    workplanePlane.setFromNormalAndCoplanarPoint(workplaneUnitNormal, workplaneOrigin)
    if (!event.ray.intersectPlane(workplanePlane, objectDragHit)) {
      return
    }

    objectDragPosition.set(...object.position)
    const normalOffset = objectDragPosition.clone().sub(workplaneOrigin).dot(workplaneUnitNormal)
    objectDragAnchor
      .copy(objectDragPosition)
      .addScaledVector(workplaneUnitNormal, -normalOffset)
      .sub(objectDragHit)

    objectDragRef.current = {
      objectId: object.id,
      planarOffset: objectDragAnchor.clone(),
      normalOffset,
    }

    if (orbitRef.current) {
      orbitRef.current.enabled = false
    }
  }

  useEffect(() => {
    function handleKeyChange(event: KeyboardEvent) {
      if (event.key !== 'Shift') {
        return
      }

      setShiftPanEnabled(event.type === 'keydown')
    }

    function resetShiftPan() {
      setShiftPanEnabled(false)
    }

    window.addEventListener('keydown', handleKeyChange)
    window.addEventListener('keyup', handleKeyChange)
    window.addEventListener('blur', resetShiftPan)
    return () => {
      window.removeEventListener('keydown', handleKeyChange)
      window.removeEventListener('keyup', handleKeyChange)
      window.removeEventListener('blur', resetShiftPan)
    }
  }, [])

  useEffect(() => {
    const orbit = orbitRef.current
    if (!orbit) {
      return
    }

    orbit.mouseButtons.LEFT = (shiftPanEnabled ? MOUSE.ROTATE : orbitMouseDisabled) as never
    orbit.mouseButtons.MIDDLE = MOUSE.DOLLY
    orbit.mouseButtons.RIGHT = MOUSE.ROTATE
  }, [shiftPanEnabled])

  useEffect(() => {
    function endObjectDrag() {
      objectDragRef.current = null
      if (orbitRef.current) {
        orbitRef.current.enabled = true
      }
    }

    function handleWindowPointerMove(event: PointerEvent) {
      const dragState = objectDragRef.current
      if (!dragState) {
        return
      }

      const planePoint = pointOnActiveWorkplane(event.clientX, event.clientY)
      if (!planePoint) {
        return
      }

      const nextPosition = planePoint
        .add(dragState.planarOffset)
        .addScaledVector(workplaneUnitNormal, dragState.normalOffset)

      updateObject(dragState.objectId, {
        position: vectorToTuple(nextPosition),
      })
    }

    window.addEventListener('pointermove', handleWindowPointerMove)
    window.addEventListener('pointerup', endObjectDrag)
    window.addEventListener('pointercancel', endObjectDrag)
    window.addEventListener('blur', endObjectDrag)
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove)
      window.removeEventListener('pointerup', endObjectDrag)
      window.removeEventListener('pointercancel', endObjectDrag)
      window.removeEventListener('blur', endObjectDrag)
    }
  }, [pointOnActiveWorkplane, updateObject, workplaneUnitNormal])

  return (
    <section
      className="viewport-panel panel"
      onContextMenu={(event) => event.preventDefault()}
      onDragEnter={(event) => {
        if (!isWorkplaneDrag(event)) {
          return
        }

        event.preventDefault()
        setWorkplaneDropActive(true)
      }}
      onDragLeave={(event) => {
        if (!isWorkplaneDrag(event)) {
          return
        }

        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setWorkplaneDropActive(false)
        }
      }}
      onDragOver={(event) => {
        if (!isWorkplaneDrag(event)) {
          return
        }

        event.preventDefault()
        if (!workplaneDropActive) {
          setWorkplaneDropActive(true)
        }
      }}
      onDrop={handleViewportDrop}
    >
      <div className="viewport-overlay viewport-overlay--top">
        <div className="metric-chip">
          <span>Objects</span>
          <strong>{visibleObjects.length}</strong>
        </div>
        <div className="metric-chip">
          <span>Est. Triangles</span>
          <strong>{estimatedTriangles.toLocaleString()}</strong>
        </div>
        <div className="metric-chip">
          <span>Editing</span>
          <strong>
            {selectedObjectVisible?.locked
              ? 'Locked'
              : activeTool === 'select' && selectedObjectVisible
                ? 'translate'
                : activeTool}
          </strong>
        </div>
        <div className="metric-chip">
          <span>Workplane</span>
          <strong>{workplanePlacementActive ? 'Pick surface' : workplaneLabel}</strong>
        </div>
      </div>

      <div className="viewport-overlay viewport-overlay--right">
        <div className="nav-cluster">
          {cameraPresetButtons.map((button) => (
            <button
              key={button.command}
              className="nav-button"
              onClick={() => requestCamera(button.command)}
              type="button"
            >
              {button.label}
            </button>
          ))}
          <button
            className="nav-button nav-button--icon"
            onClick={() => requestCamera('focusSelected')}
            type="button"
          >
            <Focus size={15} />
          </button>
          <button
            className="nav-button nav-button--icon"
            onClick={() => requestCamera('focusScene')}
            type="button"
          >
            <Crosshair size={15} />
          </button>
        </div>
      </div>

      {showOnboarding && (
        <div className="viewport-guide">
          <div>
            <span className="guide-eyebrow">Quick start</span>
            <h2>Start with primitives, then refine them directly in the viewport</h2>
            <p>
              Left click selects and edits with the gizmo, <strong>right drag</strong> orbits the
              camera, and <strong>Shift + left drag</strong> pans the workspace.
            </p>
          </div>
          <button className="secondary-button" onClick={() => dismissOnboarding()} type="button">
            Hide guide
          </button>
        </div>
      )}

      {(workplanePlacementActive || workplaneDropActive) && (
        <div className="viewport-overlay viewport-overlay--workplane">
          <div className={`workplane-banner ${workplaneDropActive ? 'is-drop-target' : ''}`}>
            <span className="guide-eyebrow">Surface workplane</span>
            <strong>
              {workplaneDropActive
                ? 'Drop the workplane on any visible face to continue modeling there.'
                : 'Click a visible face to place the workplane.'}
            </strong>
            <p>
              New inserts land on the active surface until you reset back to the workspace plane.
            </p>
            {!workplaneDropActive ? (
              <button
                className="secondary-button"
                onClick={() => cancelWorkplanePlacement()}
                type="button"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      )}

      <Canvas
        camera={{ fov: 42, near: 0.1, far: 2400, position: [42, 28, 42] }}
        className="viewport-canvas"
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        onPointerDown={handleViewportPointerDown}
        onPointerMissed={() => {
          if (!workplanePlacementActive) {
            selectObject(null)
          }
        }}
        shadows
      >
        <ViewportBridge bridgeRef={viewportBridgeRef} />
        <color attach="background" args={['#07131c']} />
        <ambientLight intensity={0.9} />
        <hemisphereLight color="#cce8ff" groundColor="#091827" intensity={0.8} />
        <directionalLight
          castShadow
          intensity={1.7}
          position={[36, 60, 28]}
          shadow-mapSize-height={2048}
          shadow-mapSize-width={2048}
        />
        <Environment preset="city" environmentIntensity={0.24} />
        <axesHelper args={[12]} />

        <group position={workplane.origin} quaternion={workplaneQuaternion}>
          <mesh position={[0, -0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={0}>
            <planeGeometry args={[activePlaneSize, activePlaneSize]} />
            <meshBasicMaterial
              color={activePlaneColor}
              depthWrite={false}
              opacity={activePlaneOpacity}
              side={DoubleSide}
              transparent
            />
          </mesh>
          <gridHelper
            args={[activePlaneSize, activePlaneDivisions, activePlaneColor, activeGridColor]}
            position={[0, 0.02, 0]}
          />
          {workplane.mode === 'surface' ? (
            <Html position={[0, 4, 0]} center distanceFactor={10}>
              <div className="selection-tag selection-tag--workplane">{workplaneLabel}</div>
            </Html>
          ) : null}
        </group>

        <Bounds margin={1.15}>
          <group ref={sceneRef}>
            <Suspense fallback={null}>
              {visibleObjects.map((object) => {
                const isSelected = selectedObjectVisible?.id === object.id

                if (isSelected && transformEnabled) {
                  return (
                    <TransformControls
                      key={object.id}
                      ref={transformRef}
                      mode={transformMode}
                      size={1.15}
                      space={coordinateSpace}
                      rotationSnap={MathUtils.degToRad(15)}
                      scaleSnap={0.05}
                      translationSnap={snapIncrement}
                      onMouseDown={() => {
                        if (orbitRef.current) {
                          orbitRef.current.enabled = false
                        }
                      }}
                      onMouseUp={() => {
                        if (orbitRef.current) {
                          orbitRef.current.enabled = true
                        }
                      }}
                      onObjectChange={() => {
                        const target = selectedRef.current
                        if (!target) {
                          return
                        }

                        updateObject(object.id, {
                          position: [target.position.x, target.position.y, target.position.z],
                          rotation: [
                            radiansToDegrees(target.rotation.x),
                            radiansToDegrees(target.rotation.y),
                            radiansToDegrees(target.rotation.z),
                          ],
                          scale: [target.scale.x, target.scale.y, target.scale.z],
                        })
                      }}
                    >
                      <SceneObjectNode
                        ref={selectedRef}
                        object={object}
                        onPointerDown={handleObjectPointerDown}
                        onSelect={selectObject}
                        selected
                        wireframe={viewMode === 'wireframe'}
                      />
                    </TransformControls>
                  )
                }

                return (
                  <SceneObjectNode
                    key={object.id}
                    ref={isSelected ? selectedRef : undefined}
                    object={object}
                    onPointerDown={handleObjectPointerDown}
                    onSelect={selectObject}
                    selected={isSelected}
                    wireframe={viewMode === 'wireframe'}
                  />
                )
              })}
            </Suspense>
          </group>
          <CameraDirector
            cameraRequestKind={cameraRequest.kind}
            cameraRequestToken={cameraRequest.token}
            orbitRef={orbitRef}
            sceneRef={sceneRef}
            selectedRef={selectedRef}
          />
        </Bounds>

        <ContactShadows
          blur={2.6}
          color="#081923"
          opacity={0.45}
          position={[0, 0, 0]}
          scale={120}
        />
        <OrbitControls
          ref={orbitRef}
          enableDamping
          makeDefault
          maxDistance={960}
          minDistance={4}
        />
      </Canvas>

      {selectedObjectVisible && (
        <div className="viewport-overlay viewport-overlay--bottom">
          <div className="selection-card">
            <span className="selection-card__eyebrow">
              {selectedObjectVisible.source === 'ai' ? 'Generated concept' : 'Selected'}
            </span>
            <strong>{selectedObjectVisible.name}</strong>
            <p>
              {selectedObjectVisible.kind === 'mesh' ? 'mesh' : selectedObjectVisible.type} at X{' '}
              {selectedObjectVisible.position[0].toFixed(1)} / Y{' '}
              {selectedObjectVisible.position[1].toFixed(1)} / Z{' '}
              {selectedObjectVisible.position[2].toFixed(1)}
            </p>
            <p>
              Drag the body to move on the active workplane. Use the translate, rotate, and scale
              buttons below for direct viewport handles.
            </p>
            <div className="viewport-tool-row">
              {viewportToolActions.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  className={`mini-tool-button ${activeTool === id ? 'is-active' : ''}`}
                  disabled={selectedObjectVisible.locked || workplanePlacementActive}
                  onClick={() => setActiveTool(id)}
                  type="button"
                >
                  <Icon size={14} />
                  <span>{label}</span>
                </button>
              ))}
              <span className="viewport-lock-state">
                <Grid3X3 size={14} />
                Snap {snapIncrement} mm
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="viewport-overlay viewport-overlay--hud">
        <div className="hud-card">
          <span className="guide-eyebrow">Shortcuts</span>
          <p>`RMB` orbit, `Shift + LMB` pan, wheel zoom, `G/R/S` transform, `F` focus.</p>
        </div>
      </div>

      {selectedObject?.locked ? (
        <div className="viewport-overlay viewport-overlay--lock">
          <div className="lock-banner">Selection is locked. Unlock it in the scene tree to transform.</div>
        </div>
      ) : null}

      {selectedObject && !selectedObjectVisible ? (
        <div className="viewport-overlay viewport-overlay--lock">
          <div className="lock-banner">Selection is hidden. Re-enable visibility in the scene tree.</div>
        </div>
      ) : null}
    </section>
  )
}
