import { useEffect, useEffectEvent } from 'react'

import { useCadStore } from '../store/useCadStore'

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const tagName = target.tagName.toLowerCase()
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target.isContentEditable
  )
}

export function useCadHotkeys() {
  const selectedObjectId = useCadStore((state) => state.selectedObjectId)
  const setActiveTool = useCadStore((state) => state.setActiveTool)
  const duplicateSelected = useCadStore((state) => state.duplicateSelected)
  const deleteSelected = useCadStore((state) => state.deleteSelected)
  const selectObject = useCadStore((state) => state.selectObject)
  const requestCamera = useCadStore((state) => state.requestCamera)

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (isEditableTarget(event.target)) {
      return
    }

    const key = event.key.toLowerCase()

    if ((event.ctrlKey || event.metaKey) && key === 'd') {
      event.preventDefault()
      duplicateSelected()
      return
    }

    if (key === 'q') {
      setActiveTool('select')
      return
    }

    if (key === 'g') {
      setActiveTool('move')
      return
    }

    if (key === 'r') {
      setActiveTool('rotate')
      return
    }

    if (key === 's') {
      setActiveTool('scale')
      return
    }

    if (key === 'f') {
      requestCamera(event.shiftKey ? 'focusScene' : 'focusSelected')
      return
    }

    if (key === 'delete' || key === 'backspace') {
      if (!selectedObjectId) {
        return
      }

      event.preventDefault()
      deleteSelected()
      return
    }

    if (key === 'escape') {
      selectObject(null)
      setActiveTool('select')
    }
  })

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
