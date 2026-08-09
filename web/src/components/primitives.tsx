import { type ReactNode, useMemo, useState } from 'react'
import type { RiskBand } from '../api/types'
import { IconInbox } from './icons'

export function Card({
  title,
  note,
  children,
  span,
  lead,
  glyph,
  actions,
}: {
  title?: string
  note?: string
  children: ReactNode
  /** Columns of the 12-column grid this card occupies. */
  span?: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12
  /** Marks the card a view opens on; it carries a rule in the identity hue. One per view. */
  lead?: boolean
  /** A small mark in the card head — it makes a wall of cards scannable by shape. */
  glyph?: ReactNode
  /** Controls that belong to this card: a segmented switch, a link, a count. */
  actions?: ReactNode
}) {
  return (
    <section className={`card${lead ? ' lead' : ''}${span ? ` span-${span}` : ''}`}>
      {title || glyph || actions ? (
        <div className="card-head">
          {glyph ? <div className="card-glyph">{glyph}</div> : null}
          <div className="card-head-text">
            {title ? <h2>{title}</h2> : null}
            {note ? <p className="card-note">{note}</p> : null}
          </div>
          {actions ? <div className="topbar-tools">{actions}</div> : null}
        </div>
      ) : null}
      <div className="card-body">{children}</div>
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
  span,
}: {
  label: string
  value: string | number
  caption?: string
  delta?: { value: number; goodWhenNegative?: boolean }
  /** The one figure in a view that would make someone act. At most one per view. */
  hero?: boolean
  span?: 3 | 4 | 5 | 6 | 12
}) {
  // Direction and sentiment are two different things. The arrow follows the sign; the
  // colour follows whether the movement is welcome, which for case volume means down.
  const improving =
    delta === undefined ? false : delta.goodWhenNegative ? delta.value < 0 : delta.value >= 0

  return (
    <div className={`card stat${hero ? ' hero' : ''}${span ? ` span-${span}` : ''}`}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {delta ? (
        <p className={`delta ${improving ? 'good' : 'bad'}`}>
          <span aria-hidden="true">{delta.value >= 0 ? '▲' : '▼'}</span>
          {Math.abs(delta.value).toFixed(1)}% year over year
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
    return (
      <span className="badge" style={{ color: 'var(--text-muted)' }}>
        On track
      </span>
    )
  }
  return (
    <span className="badge" style={{ color: 'var(--status-critical)' }}>
      <span aria-hidden="true">▲</span> Overdue
    </span>
  )
}

const STATUS_TONE: Record<string, string> = {
  NEW: 'var(--brand)',
  IN_PROGRESS: 'var(--brand)',
  PENDING_REVIEW: 'var(--status-warning)',
  ESCALATED: 'var(--status-serious)',
  CLOSED: 'var(--text-muted)',
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className="badge" style={{ color: STATUS_TONE[status] ?? 'var(--text-secondary)' }}>
      {titleCase(status)}
    </span>
  )
}

/**
 * A skeleton, not a spinner.
 *
 * A dashboard that swaps its whole body for the word "Loading…" reads as broken and
 * throws the layout around on every tab change. Blocking out the shape that is coming
 * keeps the page still and tells the eye where to wait.
 */
export function DashboardSkeleton() {
  return (
    <div className="grid" aria-busy="true" aria-live="polite">
      <span className="visually-hidden">Loading dashboard</span>
      {[0, 1, 2, 3].map((i) => (
        <div className="card span-3" key={i}>
          <div className="skeleton skeleton-line" style={{ width: '55%' }} />
          <div className="skeleton" style={{ height: 38, width: '70%', marginTop: 16 }} />
          <div className="skeleton skeleton-line" style={{ width: '80%', marginTop: 18 }} />
        </div>
      ))}
      <div className="card span-8">
        <div className="skeleton skeleton-line" style={{ width: '32%' }} />
        <div className="skeleton" style={{ height: 210, marginTop: 16 }} />
      </div>
      <div className="card span-4">
        <div className="skeleton skeleton-line" style={{ width: '46%' }} />
        <div className="skeleton" style={{ height: 210, marginTop: 16 }} />
      </div>
    </div>
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
  return (
    <div className="empty-state">
      <IconInbox size={26} />
      <span>{message}</span>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────── data table */

export type Column<T> = {
  key: string
  header: string
  numeric?: boolean
  /** Extra class on the body cells — `id` renders monospace in the identity hue. */
  cellClass?: string
  /** The comparable, searchable value. Defaults to the rendered text when it is a string. */
  value?: (row: T) => string | number | null | undefined
  render?: (row: T) => ReactNode
  sortable?: boolean
}

type SortState = { key: string; direction: 'asc' | 'desc' } | null

/**
 * A sortable, filterable table.
 *
 * The sorting is the user-facing point: an investigator wants their queue by due date, a
 * manager wants it by age, an executive wants it by exposure, and none of them should
 * have to ask for a different report to get there. The filter is threaded down from the
 * search box in the top bar so one control narrows every table on the page at once.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  filter,
  initialSort,
  emptyMessage,
  onRowClick,
  selectedKey,
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  filter?: string
  initialSort?: { key: string; direction: 'asc' | 'desc' }
  emptyMessage: string
  onRowClick?: (row: T) => void
  selectedKey?: string | null
}) {
  const [sort, setSort] = useState<SortState>(initialSort ?? null)

  const cellValue = (column: Column<T>, row: T): string | number | null | undefined => {
    if (column.value) return column.value(row)
    const rendered = column.render?.(row)
    return typeof rendered === 'string' || typeof rendered === 'number' ? rendered : null
  }

  const visible = useMemo(() => {
    const needle = filter?.trim().toLowerCase()
    const matched = needle
      ? rows.filter((row) =>
          columns.some((column) => {
            const value = cellValue(column, row)
            return value !== null && value !== undefined && String(value).toLowerCase().includes(needle)
          }),
        )
      : rows

    if (!sort) return matched
    const column = columns.find((c) => c.key === sort.key)
    if (!column) return matched

    // Sorting a copy: mutating the array the caller passed in would reorder the same data
    // wherever else it is drawn — the chart beside the table, most obviously.
    return [...matched].sort((a, b) => {
      const left = cellValue(column, a)
      const right = cellValue(column, b)
      // Missing values sort last in both directions; they are absent, not smallest.
      if (left === null || left === undefined) return 1
      if (right === null || right === undefined) return -1
      const comparison =
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left).localeCompare(String(right), undefined, { numeric: true })
      return sort.direction === 'asc' ? comparison : -comparison
    })
  }, [rows, columns, filter, sort])

  const toggle = (column: Column<T>) => {
    if (column.sortable === false) return
    setSort((current) =>
      current?.key === column.key
        ? { key: column.key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : // Numbers open on the largest first: "which cases cost the most" is the question
          // being asked, not "which cost the least".
          { key: column.key, direction: column.numeric ? 'desc' : 'asc' },
    )
  }

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map((column) => {
              const active = sort?.key === column.key
              const sortable = column.sortable !== false
              return (
                <th
                  key={column.key}
                  className={`${column.numeric ? 'numeric' : ''}${sortable ? ' sortable' : ''}`}
                  aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                  onClick={() => toggle(column)}
                  title={sortable ? `Sort by ${column.header}` : undefined}
                >
                  {column.header}
                  {active ? (
                    <span className="sort-arrow" aria-hidden="true">
                      {sort.direction === 'asc' ? '↑' : '↓'}
                    </span>
                  ) : null}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr>
              <td className="table-empty" colSpan={columns.length}>
                {filter?.trim() ? `Nothing matches “${filter.trim()}”.` : emptyMessage}
              </td>
            </tr>
          ) : (
            visible.map((row) => {
              const key = rowKey(row)
              return (
                <tr
                  key={key}
                  data-selected={selectedKey === key ? 'true' : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={onRowClick ? { cursor: 'pointer' } : undefined}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`${column.numeric ? 'numeric' : ''} ${column.cellClass ?? ''}`.trim()}
                    >
                      {column.render ? column.render(row) : (cellValue(column, row) ?? '—')}
                    </td>
                  ))}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

/* ───────────────────────────────────────────────────────────────────────── formats */

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

/** Compact form for axis ticks and dense cells: $1.9M rather than $1,875,000. */
export function formatCompactCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
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
