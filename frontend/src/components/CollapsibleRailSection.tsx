import { useId, useState, type ReactNode } from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'

interface CollapsibleRailSectionProps {
  icon: LucideIcon
  title: string
  children: ReactNode
  defaultOpen?: boolean
  badge?: string
}

export function CollapsibleRailSection({
  icon: Icon,
  title,
  children,
  defaultOpen = true,
  badge,
}: CollapsibleRailSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const contentId = useId()

  return (
    <section className={`rail-section ${open ? 'is-open' : ''}`}>
      <button
        aria-controls={contentId}
        aria-expanded={open}
        className="rail-section__summary"
        onClick={() => setOpen((previous) => !previous)}
        type="button"
      >
        <span className="rail-section__heading">
          <Icon size={16} />
          <span>{title}</span>
        </span>
        <span className="rail-section__meta">
          {badge ? <span className="rail-section__badge">{badge}</span> : null}
          <ChevronDown className="rail-section__chevron" size={16} />
        </span>
      </button>

      {open ? (
        <div className="rail-section__body" id={contentId}>
          {children}
        </div>
      ) : null}
    </section>
  )
}
