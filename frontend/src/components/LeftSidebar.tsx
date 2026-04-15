import { startTransition, useDeferredValue, useMemo, useState } from 'react'
import { FolderKanban, Search, Shapes, Sparkles } from 'lucide-react'

import { primitiveCatalog } from '../data/primitives'
import { useCadStore } from '../store/useCadStore'
import { CollapsibleRailSection } from './CollapsibleRailSection'
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
      const haystack =
        `${primitive.label} ${primitive.category} ${primitive.description}`.toLowerCase()
      return haystack.includes(query)
    })
  }, [deferredSearch])

  const visibleCount = sceneObjects.filter((object) => !object.hidden).length
  const aiCount = sceneObjects.filter((object) => object.source === 'ai').length

  return (
    <aside className="sidebar panel">
      <CollapsibleRailSection
        badge={`${visibleCount} visible`}
        defaultOpen
        icon={FolderKanban}
        title="Workspace"
      >
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

        <div className="sidebar-note">
          Keep the scene tree tidy as the assembly grows. Hidden objects leave the viewport
          immediately, and locked objects stay visible without letting accidental edits slip in.
        </div>
      </CollapsibleRailSection>

      <CollapsibleRailSection
        badge={`${filteredPrimitives.length} shapes`}
        defaultOpen
        icon={Shapes}
        title="Primitive Library"
      >
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
      </CollapsibleRailSection>

      <CollapsibleRailSection
        badge={`${sceneObjects.length} items`}
        defaultOpen
        icon={Sparkles}
        title="Scene Tree"
      >
        <SceneTree showHeading={false} />
      </CollapsibleRailSection>
    </aside>
  )
}
