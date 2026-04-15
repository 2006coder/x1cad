import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import {
  buildDemoScene,
  createSceneObject,
  createSceneObjectFromAiResult,
  createSceneObjectFromAiSuggestion,
} from '../data/primitives'
import type {
  ActiveTool,
  CameraCommand,
  CoordinateSpace,
  PrimitiveParams,
  PrimitiveType,
  SceneObject,
  Vector3Tuple,
  ViewMode,
  WorkplaneState,
} from '../types/cad'
import { WORKSPACE_WORKPLANE } from '../types/cad'
import type { GenerationResult } from '../types/system'
import { createObjectId } from '../utils/objectId'

interface CameraRequest {
  kind: CameraCommand
  token: number
}

interface CadState {
  sceneObjects: SceneObject[]
  selectedObjectId: string | null
  activeTool: ActiveTool
  coordinateSpace: CoordinateSpace
  snapIncrement: number
  viewMode: ViewMode
  workplane: WorkplaneState
  workplanePlacementActive: boolean
  showOnboarding: boolean
  cameraRequest: CameraRequest
  addPrimitive: (type: PrimitiveType) => void
  addGeneratedObject: (result: GenerationResult) => void
  addGeneratedProxyObject: (result: GenerationResult) => void
  selectObject: (id: string | null) => void
  updateObject: (id: string, patch: Partial<Omit<SceneObject, 'id' | 'type'>>) => void
  updateObjectParams: (id: string, params: PrimitiveParams) => void
  updateVector: (
    id: string,
    key: 'position' | 'rotation' | 'scale',
    index: number,
    value: number,
  ) => void
  setActiveTool: (tool: ActiveTool) => void
  setCoordinateSpace: (space: CoordinateSpace) => void
  setSnapIncrement: (value: number) => void
  setViewMode: (mode: ViewMode) => void
  renameObject: (id: string, name: string) => void
  toggleObjectVisibility: (id: string) => void
  toggleObjectLock: (id: string) => void
  duplicateSelected: () => void
  deleteSelected: () => void
  loadDemoScene: () => void
  dismissOnboarding: () => void
  openOnboarding: () => void
  armWorkplanePlacement: () => void
  cancelWorkplanePlacement: () => void
  setSurfaceWorkplane: (workplane: Omit<WorkplaneState, 'mode'>) => void
  resetWorkplane: () => void
  requestCamera: (kind: CameraCommand) => void
  nudgeSelected: (axis: 0 | 1 | 2, delta: number) => void
}

const demoScene = buildDemoScene()

function isVector3Tuple(value: unknown): value is Vector3Tuple {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  )
}

function sanitizeTuple(value: unknown, fallback: Vector3Tuple): Vector3Tuple {
  return isVector3Tuple(value) ? value : fallback
}

function sanitizeWorkplane(value: unknown): WorkplaneState {
  if (!value || typeof value !== 'object') {
    return WORKSPACE_WORKPLANE
  }

  const candidate = value as Partial<WorkplaneState>
  return {
    mode: candidate.mode === 'surface' ? 'surface' : 'workspace',
    origin: sanitizeTuple(candidate.origin, WORKSPACE_WORKPLANE.origin),
    normal: sanitizeTuple(candidate.normal, WORKSPACE_WORKPLANE.normal),
    xAxis: sanitizeTuple(candidate.xAxis, WORKSPACE_WORKPLANE.xAxis),
    label:
      typeof candidate.label === 'string' && candidate.label.trim()
        ? candidate.label
        : WORKSPACE_WORKPLANE.label,
  }
}

function sanitizeSceneObject(object: Partial<SceneObject>, index: number): SceneObject {
  return {
    id: typeof object.id === 'string' && object.id ? object.id : `recovered-${index}`,
    kind: object.kind ?? ('primitive' as const),
    type: object.type ?? 'box',
    name: typeof object.name === 'string' && object.name ? object.name : `Recovered Object ${index + 1}`,
    color: typeof object.color === 'string' && object.color ? object.color : '#7dd3fc',
    params: object.params ?? {},
    position: sanitizeTuple(object.position, [0, 0, 0]),
    rotation: sanitizeTuple(object.rotation, [0, 0, 0]),
    scale: sanitizeTuple(object.scale, [1, 1, 1]),
    hidden: object.hidden ?? false,
    locked: object.locked ?? false,
    source: object.source ?? ('manual' as const),
    generationPrompt: object.generationPrompt,
    meshAssetId: object.meshAssetId,
    meshVertices: object.meshVertices,
    meshFaces: object.meshFaces,
    meshOutputMode: object.meshOutputMode,
    meshWarning: object.meshWarning ?? null,
  }
}

function updateTuple(tuple: Vector3Tuple, index: number, value: number): Vector3Tuple {
  return tuple.map((entry, entryIndex) => (entryIndex === index ? value : entry)) as Vector3Tuple
}

export const useCadStore = create<CadState>()(
  persist(
    (set) => ({
      sceneObjects: demoScene,
      selectedObjectId: demoScene[0]?.id ?? null,
      activeTool: 'select',
      coordinateSpace: 'world',
      snapIncrement: 1,
      viewMode: 'shaded',
      workplane: WORKSPACE_WORKPLANE,
      workplanePlacementActive: false,
      showOnboarding: true,
      cameraRequest: { kind: 'focusScene', token: 0 },
      addPrimitive: (type) =>
        set((state) => {
          const nextObject = createSceneObject(type, state.sceneObjects.length, state.workplane)
          return {
            sceneObjects: [...state.sceneObjects, nextObject],
            selectedObjectId: nextObject.id,
            cameraRequest: {
              kind: 'focusSelected',
              token: state.cameraRequest.token + 1,
            },
          }
        }),
      addGeneratedObject: (result) =>
        set((state) => {
          const nextObject = createSceneObjectFromAiResult(
            result,
            state.sceneObjects.length,
            state.workplane,
          )
          return {
            sceneObjects: [...state.sceneObjects, nextObject],
            selectedObjectId: nextObject.id,
            cameraRequest: {
              kind: 'focusSelected',
              token: state.cameraRequest.token + 1,
            },
          }
        }),
      addGeneratedProxyObject: (result) =>
        set((state) => {
          const nextObject = createSceneObjectFromAiSuggestion(
            result,
            state.sceneObjects.length,
            state.workplane,
          )
          return {
            sceneObjects: [...state.sceneObjects, nextObject],
            selectedObjectId: nextObject.id,
            cameraRequest: {
              kind: 'focusSelected',
              token: state.cameraRequest.token + 1,
            },
          }
        }),
      selectObject: (id) => set({ selectedObjectId: id }),
      updateObject: (id, patch) =>
        set((state) => ({
          sceneObjects: state.sceneObjects.map((object) =>
            object.id === id ? { ...object, ...patch } : object,
          ),
        })),
      updateObjectParams: (id, params) =>
        set((state) => ({
          sceneObjects: state.sceneObjects.map((object) =>
            object.id === id ? { ...object, params: { ...object.params, ...params } } : object,
          ),
        })),
      updateVector: (id, key, index, value) =>
        set((state) => ({
          sceneObjects: state.sceneObjects.map((object) =>
            object.id === id
              ? {
                  ...object,
                  [key]: updateTuple(object[key] as Vector3Tuple, index, value),
                }
              : object,
          ),
        })),
      setActiveTool: (tool) => set({ activeTool: tool }),
      setCoordinateSpace: (space) => set({ coordinateSpace: space }),
      setSnapIncrement: (value) => set({ snapIncrement: value }),
      setViewMode: (mode) => set({ viewMode: mode }),
      renameObject: (id, name) =>
        set((state) => ({
          sceneObjects: state.sceneObjects.map((object) =>
            object.id === id ? { ...object, name: name.trim() || object.name } : object,
          ),
        })),
      toggleObjectVisibility: (id) =>
        set((state) => {
          const sceneObjects = state.sceneObjects.map((object) =>
            object.id === id ? { ...object, hidden: !object.hidden } : object,
          )
          const selectedObject = sceneObjects.find((object) => object.id === state.selectedObjectId)

          return {
            sceneObjects,
            selectedObjectId: selectedObject?.hidden ? null : state.selectedObjectId,
          }
        }),
      toggleObjectLock: (id) =>
        set((state) => ({
          sceneObjects: state.sceneObjects.map((object) =>
            object.id === id ? { ...object, locked: !object.locked } : object,
          ),
        })),
      duplicateSelected: () =>
        set((state) => {
          const target = state.sceneObjects.find((object) => object.id === state.selectedObjectId)
          if (!target) {
            return state
          }

          const duplicate = {
            ...target,
            id: createObjectId(target.type),
            name: `${target.name} Copy`,
            position: [
              target.position[0] + 12,
              target.position[1],
              target.position[2] + 12,
            ] as Vector3Tuple,
            hidden: false,
            locked: false,
          }

          return {
            sceneObjects: [...state.sceneObjects, duplicate],
            selectedObjectId: duplicate.id,
            cameraRequest: {
              kind: 'focusSelected',
              token: state.cameraRequest.token + 1,
            },
          }
        }),
      deleteSelected: () =>
        set((state) => {
          if (!state.selectedObjectId) {
            return state
          }

          const remaining = state.sceneObjects.filter(
            (object) => object.id !== state.selectedObjectId,
          )

          return {
            sceneObjects: remaining,
            selectedObjectId: remaining[0]?.id ?? null,
          }
        }),
      loadDemoScene: () => {
        const nextScene = buildDemoScene()
        set((state) => ({
          sceneObjects: nextScene,
          selectedObjectId: nextScene[0]?.id ?? null,
          workplane: WORKSPACE_WORKPLANE,
          workplanePlacementActive: false,
          showOnboarding: true,
          cameraRequest: {
            kind: 'focusScene',
            token: state.cameraRequest.token + 1,
          },
        }))
      },
      dismissOnboarding: () => set({ showOnboarding: false }),
      openOnboarding: () => set({ showOnboarding: true }),
      armWorkplanePlacement: () => set({ workplanePlacementActive: true }),
      cancelWorkplanePlacement: () => set({ workplanePlacementActive: false }),
      setSurfaceWorkplane: (workplane) =>
        set({
          workplane: {
            ...workplane,
            mode: 'surface',
          },
          workplanePlacementActive: false,
        }),
      resetWorkplane: () =>
        set({
          workplane: WORKSPACE_WORKPLANE,
          workplanePlacementActive: false,
        }),
      requestCamera: (kind) =>
        set((state) => ({
          cameraRequest: {
            kind,
            token: state.cameraRequest.token + 1,
          },
        })),
      nudgeSelected: (axis, delta) =>
        set((state) => {
          const target = state.sceneObjects.find((object) => object.id === state.selectedObjectId)
          if (!target || target.locked) {
            return state
          }

          return {
            sceneObjects: state.sceneObjects.map((object) =>
              object.id === target.id
                ? {
                    ...object,
                    position: updateTuple(object.position, axis, object.position[axis] + delta),
                  }
                : object,
            ),
          }
        }),
    }),
    {
      name: 'x1cad-workspace',
      partialize: (state) => ({
        sceneObjects: state.sceneObjects,
        selectedObjectId: state.selectedObjectId,
        activeTool: state.activeTool,
        coordinateSpace: state.coordinateSpace,
        snapIncrement: state.snapIncrement,
        viewMode: state.viewMode,
        workplane: state.workplane,
        showOnboarding: state.showOnboarding,
      }),
      version: 4,
      merge: (persistedState, currentState) => {
        const state = persistedState as Partial<CadState>
        const sceneObjects =
          state.sceneObjects?.map((object, index) => sanitizeSceneObject(object, index)) ??
          currentState.sceneObjects
        const selectedObjectId =
          sceneObjects.some((object) => object.id === state.selectedObjectId)
            ? state.selectedObjectId ?? null
            : sceneObjects[0]?.id ?? null

        return {
          ...currentState,
          ...state,
          sceneObjects,
          selectedObjectId,
          workplane: sanitizeWorkplane(state.workplane),
          workplanePlacementActive: false,
          cameraRequest: currentState.cameraRequest,
        }
      },
      migrate: (persistedState) => {
        const state = persistedState as Partial<CadState>
        return {
          sceneObjects:
            state.sceneObjects?.map((object, index) => sanitizeSceneObject(object, index)) ??
            buildDemoScene(),
          selectedObjectId: state.selectedObjectId ?? demoScene[0]?.id ?? null,
          activeTool: state.activeTool ?? 'select',
          coordinateSpace: state.coordinateSpace ?? 'world',
          snapIncrement: state.snapIncrement ?? 1,
          viewMode: state.viewMode ?? 'shaded',
          workplane: sanitizeWorkplane(state.workplane),
          workplanePlacementActive: false,
          showOnboarding: state.showOnboarding ?? true,
          cameraRequest: { kind: 'focusScene', token: 0 },
        } as CadState
      },
    },
  ),
)

export const useSelectedObject = () => {
  const sceneObjects = useCadStore((state) => state.sceneObjects)
  const selectedObjectId = useCadStore((state) => state.selectedObjectId)
  return sceneObjects.find((object) => object.id === selectedObjectId) ?? null
}
