import { useDeferredValue, useMemo, useState } from 'react'
import { Eye, EyeOff, Lock, LockOpen, Search } from 'lucide-react'

import { useCadStore } from '../store/useCadStore'

export function SceneTree() {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const sceneObjects = useCadStore((state) => state.sceneObjects)
  const selectedObjectId = useCadStore((state) => state.selectedObjectId)
  const renameObject = useCadStore((state) => state.renameObject)
  const selectObject = useCadStore((state) => state.selectObject)
  const toggleObjectLock = useCadStore((state) => state.toggleObjectLock)
  const toggleObjectVisibility = useCadStore((state) => state.toggleObjectVisibility)

  const filteredObjects = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase()
    if (!normalizedQuery) {
      return sceneObjects
    }

    return sceneObjects.filter((object) =>
      `${object.name} ${object.type} ${object.source}`.toLowerCase().includes(normalizedQuery),
    )
  }, [deferredQuery, sceneObjects])

  return (
    <section className="sidebar-section">
      <div className="section-heading">
        <span>Scene Tree</span>
      </div>

      <label className="search-shell">
        <Search size={14} />
        <input
          aria-label="Search scene objects"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search objects"
          type="search"
          value={query}
        />
      </label>

      <div className="scene-tree">
        {filteredObjects.map((object) => (
          <article
            key={object.id}
            className={`scene-row ${selectedObjectId === object.id ? 'is-selected' : ''}`}
          >
            <button className="scene-row__main" onClick={() => selectObject(object.id)} type="button">
              <span className={`swatch ${object.hidden ? 'swatch--muted' : ''}`} style={{ backgroundColor: object.color }} />
              <span className="scene-row__copy">
                <strong>{object.name}</strong>
                <small>
                  {object.type} • {object.source}
                </small>
              </span>
            </button>

            <div className="scene-row__actions">
              <button
                aria-label={object.hidden ? 'Show object' : 'Hide object'}
                className="icon-button icon-button--ghost"
                onClick={() => toggleObjectVisibility(object.id)}
                type="button"
              >
                {object.hidden ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
              <button
                aria-label={object.locked ? 'Unlock object' : 'Lock object'}
                className="icon-button icon-button--ghost"
                onClick={() => toggleObjectLock(object.id)}
                type="button"
              >
                {object.locked ? <Lock size={15} /> : <LockOpen size={15} />}
              </button>
            </div>

            {selectedObjectId === object.id ? (
              <div className="scene-row__editor">
                <input
                  aria-label="Rename object"
                  className="scene-row__input"
                  onChange={(event) => renameObject(object.id, event.target.value)}
                  value={object.name}
                />
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  )
}
