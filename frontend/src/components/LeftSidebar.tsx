import { startTransition, useDeferredValue, useMemo, useState } from 'react'
import { FolderKanban, Search, Shapes, Sparkles } from 'lucide-react'

import { primitiveCatalog } from '../data/primitives'
import { useCadStore } from '../store/useCadStore'
import { SceneTree } from './SceneTree'

export function LeftSidebar() {
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const sceneObjects = useCadStore((state) => state.sceneObjects)
  const addPrimitive = useCadStore((state) => state.addPrimitive)

  const filteredPrimitives = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase()
    if (!query) {
      return primitiveCatalog
    }

    return primitiveCatalog.filter((primitive) => {
      const haystack = `${primitive.label} ${primitive.category} ${primitive.description}`.toLowerCase()
      return haystack.includes(query)
    })
  }, [deferredSearch])

  const visibleCount = sceneObjects.filter((object) => !object.hidden).length
  const aiCount = sceneObjects.filter((object) => object.source === 'ai').length

  return (
    <aside className="sidebar panel">
      <section className="sidebar-section">
        <div className="section-heading">
          <FolderKanban size={16} />
          <span>Workspace</span>
        </div>
        <div className="project-summary-card project-summary-card--glow">
          <div className="project-summary-card__header">
            <div>
              <h2>Manual CAD first</h2>
              <p>Direct modeling stays fast, exact, and available even when AI is unavailable.</p>
            </div>
            <div className="project-summary-badge">Local</div>
          </div>
          <div className="summary-metrics">
            <div>
              <span className="guide-eyebrow">Visible</span>
              <strong>{visibleCount}</strong>
            </div>
            <div>
              <span className="guide-eyebrow">Generated</span>
              <strong>{aiCount}</strong>
            </div>
            <div>
              <span className="guide-eyebrow">Autosave</span>
              <strong>Browser</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="sidebar-section">
        <div className="section-heading">
          <Shapes size={16} />
          <span>Primitive Library</span>
        </div>
        <label className="search-shell">
          <Search size={14} />
          <input
            aria-label="Search primitives"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search shapes"
            type="search"
            value={search}
          />
        </label>

        <div className="library-grid">
          {filteredPrimitives.map((primitive) => (
            <article
              key={primitive.type}
              className="primitive-card"
              style={{ ['--accent-color' as string]: primitive.accent }}
            >
              <div className="primitive-card__header">
                <div>
                  <span className="primitive-card__category">{primitive.category}</span>
                  <h3>{primitive.label}</h3>
                </div>
                <button
                  className="primary-button"
                  onClick={() => startTransition(() => addPrimitive(primitive.type))}
                  type="button"
                >
                  Insert
                </button>
              </div>
              <p>{primitive.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sidebar-section">
        <div className="section-heading">
          <Sparkles size={16} />
          <span>Assembly Control</span>
        </div>
        <div className="sidebar-note">
          Use the scene tree to rename, lock, or hide parts as your model grows. Hidden objects are
          removed from the viewport immediately, and locked objects stay selectable but non-editable.
        </div>
      </section>

      <SceneTree />
    </aside>
  )
}
