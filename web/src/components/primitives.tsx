import type { ReactNode } from 'react'
import type { RiskBand } from '../api/types'

export function Card({
  title,
  note,
  children,
  span,
  lead,
}: {
  title?: string
  note?: string
  children: ReactNode
  span?: number
  /** Marks the card a view opens on; it carries a rule in the identity hue. One per view. */
  lead?: boolean
}) {
  return (
    <section
      className={`card${lead ? ' lead' : ''}`}
      style={span ? { gridColumn: `span ${span}` } : undefined}
    >
      {title ? <h2>{title}</h2> : null}
      {note ? <p className="card-note">{note}</p> : null}
      {children}
    </section>
  )
}

/** A stat tile. A single number needs no plot — the form heuristic's "not a chart" case. */
export function Stat({
  label,
  value,
  caption,
  delta,
  hero,
}: {
  label: string
  value: string | number
  caption?: string
  delta?: { value: number; goodWhenNegative?: boolean }
  /** The one figure in a view that would make someone act. At most one per view. */
  hero?: boolean
}) {
  const deltaClass =
    delta === undefined
      ? undefined
      : (delta.value >= 0) === !delta.goodWhenNegative
        ? 'delta-up'
        : 'delta-down'

  return (
    <div className={`card${hero ? ' hero' : ''}`}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {delta ? (
        <p className={`stat-caption ${deltaClass}`}>
          {delta.value >= 0 ? '▲' : '▼'} {Math.abs(delta.value).toFixed(1)}% year over year
        </p>
      ) : null}
      {caption ? <p className="stat-caption">{caption}</p> : null}
    </div>
  )
}

const BAND_STYLE: Record<RiskBand, { color: string; icon: string; label: string }> = {
  // Status colors are reserved and never carry meaning alone — each ships with an icon
  // and the band name spelled out.
  HIGH: { color: 'var(--status-critical)', icon: '▲', label: 'High' },
  MEDIUM: { color: 'var(--status-warning)', icon: '◆', label: 'Medium' },
  LOW: { color: 'var(--status-good)', icon: '●', label: 'Low' },
}

export function RiskBadge({ band }: { band: RiskBand }) {
  const style = BAND_STYLE[band]
  return (
    <span className="badge" style={{ color: style.color }}>
      <span aria-hidden="true">{style.icon}</span> {style.label} risk
    </span>
  )
}

export function OverdueBadge({ overdue }: { overdue: boolean }) {
  if (!overdue) {
    return <span className="badge" style={{ color: 'var(--text-secondary)' }}>On track</span>
  }
  return (
    <span className="badge" style={{ color: 'var(--status-critical)' }}>
      <span aria-hidden="true">▲</span> Overdue
    </span>
  )
}

export function Loading({ what }: { what: string }) {
  return (
    <p className="notice" role="status">
      Loading {what}…
    </p>
  )
}

export function ErrorNotice({ message }: { message: string }) {
  return (
    <p className="notice error" role="alert">
      {message}
    </p>
  )
}

export function Empty({ message }: { message: string }) {
  return <p className="notice">{message}</p>
}

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
