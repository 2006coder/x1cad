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
  const snapIncrement = useCadStore((state) => state.snapIncrement)
  const setActiveTool = useCadStore((state) => state.setActiveTool)
  const duplicateSelected = useCadStore((state) => state.duplicateSelected)
  const deleteSelected = useCadStore((state) => state.deleteSelected)
  const nudgeSelected = useCadStore((state) => state.nudgeSelected)
  const selectObject = useCadStore((state) => state.selectObject)
  const requestCamera = useCadStore((state) => state.requestCamera)

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (isEditableTarget(event.target)) {
      return
    }

    const key = event.key.toLowerCase()
    const nudgeStep = (event.shiftKey ? 5 : 1) * snapIncrement

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

    if (key === 'arrowleft') {
      event.preventDefault()
      nudgeSelected(0, -nudgeStep)
      return
    }

    if (key === 'arrowright') {
      event.preventDefault()
      nudgeSelected(0, nudgeStep)
      return
    }

    if (key === 'arrowup') {
      event.preventDefault()
      nudgeSelected(2, -nudgeStep)
      return
    }

    if (key === 'arrowdown') {
      event.preventDefault()
      nudgeSelected(2, nudgeStep)
      return
    }

    if (key === 'pageup') {
      event.preventDefault()
      nudgeSelected(1, nudgeStep)
      return
    }

    if (key === 'pagedown') {
      event.preventDefault()
      nudgeSelected(1, -nudgeStep)
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
