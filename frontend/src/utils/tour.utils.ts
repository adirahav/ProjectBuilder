import type { Tour } from '../types/tour.types'

/** Tour/bus presentation helpers for the passenger selector. */

/**
 * `12.04.2026` — the date format used across the mockups. Rendered inside a
 * `numeral` span so it stays LTR-isolated within the RTL layout.
 *
 * Falls back to the raw server value rather than throwing if the date is not
 * parseable, so one malformed record can never blank out the whole selector.
 */
export function formatTourDate(isoDate: string | null | undefined): string {
  if (!isoDate) return ''

  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return isoDate

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}.${month}.${date.getFullYear()}`
}

/** Selector option text: `הגליל העליון — 12.04.2026`. */
export function formatTourOption(tour: Tour): string {
  const date = formatTourDate(tour.startDate)
  return date ? `${tour.name} — ${date}` : tour.name
}
