import { Suspense, forwardRef, useEffect, useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
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
import { Box3, Color, Group, MathUtils, Mesh, Vector3 } from 'three'
import { Crosshair, Focus, Grid3X3, Move3D, RotateCw, Scale3D } from 'lucide-react'

import { estimateSceneObjectTriangles } from '../data/primitives'
import { useCadStore } from '../store/useCadStore'
import {
  isMeshObject,
  type ActiveTool,
  type CameraCommand,
  type PrimitiveParams,
  type SceneObject,
} from '../types/cad'

const apiBase = import.meta.env.VITE_API_BASE_URL ?? ''

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

const PrimitiveNode = forwardRef<
  Group,
  {
    object: SceneObject
    selected: boolean
    wireframe: boolean
    onSelect: (id: string) => void
  }
>(function PrimitiveNode({ object, selected, wireframe, onSelect }, ref) {
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
  const commonProps = {
    castShadow: true,
    receiveShadow: true,
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
          args={[params.width ?? 28, params.height ?? 16, params.depth ?? 20]}
          radius={Math.min(params.cornerRadius ?? 2.5, 12)}
          smoothness={Math.round(params.cornerSegments ?? 4)}
          {...commonProps}
        >
          <meshStandardMaterial {...materialProps} />
          {selected && <Edges color="#f8fafc" scale={1.02} />}
        </RoundedBox>
      ) : (
        <mesh {...commonProps}>
          {object.type === 'box' && (
            <boxGeometry args={[params.width ?? 32, params.height ?? 18, params.depth ?? 24]} />
          )}
          {object.type === 'sphere' && (
            <sphereGeometry
              args={[
                params.radius ?? 14,
                Math.round(params.widthSegments ?? 32),
                Math.round(params.heightSegments ?? 24),
              ]}
            />
          )}
          {object.type === 'cylinder' && (
            <cylinderGeometry
              args={[
                params.radiusTop ?? 10,
                params.radiusBottom ?? 10,
                params.height ?? 26,
                Math.round(params.radialSegments ?? 28),
              ]}
            />
          )}
          {object.type === 'cone' && (
            <coneGeometry
              args={[
                params.radius ?? 12,
                params.height ?? 28,
                Math.round(params.radialSegments ?? 28),
              ]}
            />
          )}
          {object.type === 'torus' && (
            <torusGeometry
              args={[
                params.majorRadius ?? 14,
                params.tubeRadius ?? 4,
                Math.round(params.radialSegments ?? 24),
                Math.round(params.tubularSegments ?? 96),
                degreesToRadians(params.arc ?? 360),
              ]}
            />
          )}
          {object.type === 'capsule' && (
            <capsuleGeometry
              args={[
                params.radius ?? 8,
                params.cylinderLength ?? 18,
                Math.round(params.capSegments ?? 12),
                Math.round(params.radialSegments ?? 24),
              ]}
            />
          )}
          {object.type === 'prism' && (
            <cylinderGeometry
              args={[
                params.circumradius ?? 12,
                params.circumradius ?? 12,
                params.height ?? 24,
                Math.max(3, Math.round(params.sides ?? 6)),
              ]}
            />
          )}
          {object.type === 'pyramid' && (
            <cylinderGeometry
              args={[
                0,
                params.baseRadius ?? 13,
                params.height ?? 28,
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

const GeneratedMeshNode = forwardRef<
  Group,
  {
    object: SceneObject & { kind: 'mesh'; type: 'generatedMesh'; meshAssetId: string }
    selected: boolean
    wireframe: boolean
    onSelect: (id: string) => void
  }
>(function GeneratedMeshNode({ object, selected, wireframe, onSelect }, ref) {
  const assetUrl = `${apiBase}/api/ai/assets/${object.meshAssetId}`
  const gltf = useGLTF(assetUrl)
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true)
    clone.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true
        child.receiveShadow = true
        if (Array.isArray(child.material)) {
          child.material = child.material.map((material) => material.clone())
        } else if (child.material) {
          child.material = child.material.clone()
        }
      }
    })
    return clone
  }, [gltf.scene])

  useEffect(() => {
    scene.traverse((child) => {
      if (!(child instanceof Mesh)) {
        return
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
  }, [object.color, scene, selected, wireframe])

  const groupRotation = object.rotation.map(degreesToRadians) as [number, number, number]

  return (
    <group
      ref={ref}
      position={object.position}
      rotation={groupRotation}
      scale={object.scale}
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
  }
>(function SceneObjectNode({ object, selected, wireframe, onSelect }, ref) {
  if (isMeshObject(object)) {
    return (
      <GeneratedMeshNode
        ref={ref}
        object={object}
        onSelect={onSelect}
        selected={selected}
        wireframe={wireframe}
      />
    )
  }

  return (
    <PrimitiveNode
      ref={ref}
      object={object}
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
  orbitRef: React.RefObject<OrbitControlsImpl | null>
  sceneRef: React.RefObject<Group | null>
  selectedRef: React.RefObject<Group | null>
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
      bounds.refresh(targetObject).clip().fit()
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
  const snapIncrement = useCadStore((state) => state.snapIncrement)
  const viewMode = useCadStore((state) => state.viewMode)
  const showOnboarding = useCadStore((state) => state.showOnboarding)
  const dismissOnboarding = useCadStore((state) => state.dismissOnboarding)
  const cameraRequest = useCadStore((state) => state.cameraRequest)
  const selectObject = useCadStore((state) => state.selectObject)
  const setActiveTool = useCadStore((state) => state.setActiveTool)
  const requestCamera = useCadStore((state) => state.requestCamera)
  const updateObject = useCadStore((state) => state.updateObject)

  const orbitRef = useRef<OrbitControlsImpl | null>(null)
  const transformRef = useRef<TransformControlsImpl | null>(null)
  const sceneRef = useRef<Group | null>(null)
  const selectedRef = useRef<Group | null>(null)

  const visibleObjects = useMemo(
    () => sceneObjects.filter((object) => !object.hidden),
    [sceneObjects],
  )

  const selectedObject = sceneObjects.find((object) => object.id === selectedObjectId) ?? null
  const selectedObjectVisible = selectedObject && !selectedObject.hidden ? selectedObject : null
  const selectedObjectVisibleId = selectedObjectVisible?.id
  const estimatedTriangles = visibleObjects.reduce(
    (total, object) => total + estimateSceneObjectTriangles(object),
    0,
  )

  const transformEnabled =
    !!selectedObjectVisible && !selectedObjectVisible.locked && activeTool !== 'select'
  const transformMode =
    activeTool === 'move' ? 'translate' : activeTool === 'rotate' ? 'rotate' : 'scale'

  useEffect(() => {
    if (!selectedObjectVisibleId) {
      return
    }

    requestCamera('focusSelected')
  }, [requestCamera, selectedObjectVisibleId])

  return (
    <section className="viewport-panel panel">
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
          <strong>{selectedObjectVisible?.locked ? 'Locked' : activeTool}</strong>
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
          <button className="nav-button nav-button--icon" onClick={() => requestCamera('focusSelected')} type="button">
            <Focus size={15} />
          </button>
          <button className="nav-button nav-button--icon" onClick={() => requestCamera('focusScene')} type="button">
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
              Use <strong>G</strong>, <strong>R</strong>, and <strong>S</strong> for transform
              modes, drag the gizmo handles for direct editing, and use the inspector for exact
              values.
            </p>
          </div>
          <button className="secondary-button" onClick={() => dismissOnboarding()} type="button">
            Hide guide
          </button>
        </div>
      )}

      <Canvas
        camera={{ fov: 42, position: [68, 42, 68] }}
        className="viewport-canvas"
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        onPointerMissed={() => selectObject(null)}
        shadows
      >
        <color attach="background" args={['#07131c']} />
        <fog attach="fog" args={['#07131c', 120, 220]} />
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
        <gridHelper args={[240, 48, '#2dd4bf', '#163447']} position={[0, 0, 0]} />
        <axesHelper args={[24]} />

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
                    onSelect={selectObject}
                    selected={isSelected}
                    wireframe={viewMode === 'wireframe'}
                  />
                )
              })}
            </Suspense>
          </group>
        </Bounds>

        <ContactShadows blur={2.6} color="#081923" opacity={0.45} position={[0, 0, 0]} scale={180} />
        <OrbitControls
          ref={orbitRef}
          enableDamping
          makeDefault
          maxDistance={180}
          minDistance={24}
          target={selectedObjectVisible?.position ?? [0, 10, 0]}
        />
        <CameraDirector
          cameraRequestKind={cameraRequest.kind}
          cameraRequestToken={cameraRequest.token}
          orbitRef={orbitRef}
          sceneRef={sceneRef}
          selectedRef={selectedRef}
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
              {selectedObjectVisible.kind === 'mesh' ? 'mesh' : selectedObjectVisible.type} at X {selectedObjectVisible.position[0].toFixed(1)} / Y{' '}
              {selectedObjectVisible.position[1].toFixed(1)} / Z {selectedObjectVisible.position[2].toFixed(1)}
            </p>
            <div className="viewport-tool-row">
              {viewportToolActions.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  className={`mini-tool-button ${activeTool === id ? 'is-active' : ''}`}
                  disabled={selectedObjectVisible.locked}
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
          <p>`G` move, `R` rotate, `S` scale, `F` focus, arrows/PageUp/PageDown nudge.</p>
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
