import type {
  Manifest,
  ManifestFilters,
  ManifestRow,
  ManifestStatusFilter,
} from '../types/manifest.types'
import type { SeatStatus } from '../types/seat.types'
import { normalizePhone, seatStatusLabels } from './seat.utils'

/**
 * Passenger-manifest filtering and report formatting (Screen 4c, F15/F16).
 *
 * Both the filter and the report are entirely client-side over the rows the
 * server already returned (plan 009 §Scope) — no extra request is made when the
 * admin narrows the table or copies the report.
 *
 * Status labels and icons are reused from `seat.utils.ts` rather than redefined,
 * so the manifest names a status exactly as the seat map does
 * (.rule/ui-rules.md).
 */

/** Report/table grouping order: occupied seats first, free seats last. */
export const MANIFEST_STATUS_ORDER: SeatStatus[] = ['taken', 'pending', 'reserved', 'available']

/** Placeholder for a row with no passenger (an `available` or blocked seat). */
export const EMPTY_FIELD = '—'

/** Options for the status filter, with "all" first. */
export function buildStatusFilterOptions(): { value: ManifestStatusFilter; label: string }[] {
  return [
    { value: 'all', label: 'כל הסטטוסים' },
    ...MANIFEST_STATUS_ORDER.map((status) => ({
      value: status as ManifestStatusFilter,
      label: seatStatusLabels[status],
    })),
  ]
}

/**
 * Free-text match across name, phone, and pickup point (PRD Tab 4c).
 *
 * The phone is matched twice — as typed and normalized — so searching `052-447`
 * finds a row stored as `0524471903`, and vice versa. Matching is
 * case-insensitive; Hebrew has no case, but names may contain Latin characters.
 */
function matchesQuery(row: ManifestRow, query: string): boolean {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return true

  const normalizedQuery = normalizePhone(trimmed)
  const haystack = [
    row.fullName ?? '',
    row.phone ?? '',
    normalizePhone(row.phone ?? ''),
    row.pickupPoint ?? '',
  ]

  return haystack.some(
    (field) =>
      field.toLowerCase().includes(trimmed) ||
      (normalizedQuery.length > 0 && normalizePhone(field).includes(normalizedQuery)),
  )
}

/** Applies the status filter and the free-text query, in that order. */
export function filterManifestRows(rows: ManifestRow[], filters: ManifestFilters): ManifestRow[] {
  return rows.filter(
    (row) =>
      (filters.status === 'all' || row.status === filters.status) &&
      matchesQuery(row, filters.query),
  )
}

/** How many rows carry each status, for the summary chips above the table. */
export function countManifestByStatus(rows: ManifestRow[]): Record<SeatStatus, number> {
  const counts: Record<SeatStatus, number> = {
    available: 0,
    pending: 0,
    taken: 0,
    reserved: 0,
  }
  for (const row of rows) counts[row.status] += 1
  return counts
}

/** Sorts by the report's status order, then by seat label numerically. */
export function sortManifestRows(rows: ManifestRow[]): ManifestRow[] {
  return [...rows].sort((a, b) => {
    const byStatus =
      MANIFEST_STATUS_ORDER.indexOf(a.status) - MANIFEST_STATUS_ORDER.indexOf(b.status)
    if (byStatus !== 0) return byStatus
    return a.seatLabel.localeCompare(b.seatLabel, 'he', { numeric: true })
  })
}

/**
 * Formats the rows as a plain-text, human-readable report grouped by status
 * (plan 009, Open Question 2 — the PRD's stated use case is WhatsApp/print
 * sharing, not spreadsheet import, so this is deliberately not CSV).
 *
 * Only the rows currently visible are formatted, so the copied report always
 * matches what the admin can see on screen — copying a filtered table must never
 * silently include rows the filter excluded.
 *
 * `available` seats are summarized as a count rather than listed one by one:
 * they have no passenger details, and a 30-line list of empty seats would bury
 * the part of the report that carries information.
 */
export function formatManifestReport(bus: Manifest['bus'], rows: ManifestRow[]): string {
  const lines: string[] = [`רשימת נוסעים — ${bus.name}`, '']

  for (const status of MANIFEST_STATUS_ORDER) {
    const inStatus = sortManifestRows(rows.filter((row) => row.status === status))
    if (inStatus.length === 0) continue

    lines.push(`${seatStatusLabels[status]} (${inStatus.length})`)

    if (status === 'available') {
      lines.push(`מושבים: ${inStatus.map((row) => row.seatLabel).join(', ')}`)
    } else {
      for (const row of inStatus) {
        const details = [row.fullName, row.phone, row.pickupPoint].filter(Boolean).join(' - ')
        lines.push(`${row.seatLabel}. ${details || EMPTY_FIELD}`)
      }
    }

    lines.push('')
  }

  lines.push(`סה"כ ${rows.length} מתוך ${bus.seatCount} מושבים`)

  return lines.join('\n')
}
