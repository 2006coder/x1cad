import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { buildDemoScene, createSceneObject, createSceneObjectFromAiResult } from '../data/primitives'
import type {
  ActiveTool,
  CameraCommand,
  CoordinateSpace,
  PrimitiveParams,
  PrimitiveType,
  SceneObject,
  Vector3Tuple,
  ViewMode,
} from '../types/cad'
import type { GenerationResult } from '../types/system'

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
  showOnboarding: boolean
  cameraRequest: CameraRequest
  addPrimitive: (type: PrimitiveType) => void
  addGeneratedObject: (result: GenerationResult) => void
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
  requestCamera: (kind: CameraCommand) => void
}

const demoScene = buildDemoScene()

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
      showOnboarding: true,
      cameraRequest: { kind: 'focusScene', token: 0 },
      addPrimitive: (type) =>
        set((state) => {
          const nextObject = createSceneObject(type, state.sceneObjects.length)
          return {
            sceneObjects: [...state.sceneObjects, nextObject],
            selectedObjectId: nextObject.id,
          }
        }),
      addGeneratedObject: (result) =>
        set((state) => {
          const nextObject = createSceneObjectFromAiResult(result, state.sceneObjects.length)
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
            id: `${target.type}-${crypto.randomUUID()}`,
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
        set({
          sceneObjects: nextScene,
          selectedObjectId: nextScene[0]?.id ?? null,
          showOnboarding: true,
        })
      },
      dismissOnboarding: () => set({ showOnboarding: false }),
      openOnboarding: () => set({ showOnboarding: true }),
      requestCamera: (kind) =>
        set((state) => ({
          cameraRequest: {
            kind,
            token: state.cameraRequest.token + 1,
          },
        })),
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
        showOnboarding: state.showOnboarding,
      }),
      version: 3,
      migrate: (persistedState) => {
        const state = persistedState as Partial<CadState>
        return {
          sceneObjects:
            state.sceneObjects?.map((object) => ({
              ...object,
              kind: object.kind ?? ('primitive' as const),
              hidden: object.hidden ?? false,
              locked: object.locked ?? false,
              source: object.source ?? ('manual' as const),
            })) ?? buildDemoScene(),
          selectedObjectId: state.selectedObjectId ?? demoScene[0]?.id ?? null,
          activeTool: state.activeTool ?? 'select',
          coordinateSpace: state.coordinateSpace ?? 'world',
          snapIncrement: state.snapIncrement ?? 1,
          viewMode: state.viewMode ?? 'shaded',
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
