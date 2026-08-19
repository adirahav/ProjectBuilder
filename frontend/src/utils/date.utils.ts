import type { Locale } from '../types/i18n.types'
import { toIntlLocale } from './format.utils'

// The clinic is single-location and the PRD states no multi-timezone
// requirement, so "today" always means today in the browser's local timezone.
// Every date crossing the API boundary is the calendar-day string `YYYY-MM-DD`,
// never a UTC instant — using `toISOString()` here would shift the day backwards
// for anyone east of Greenwich late in the evening.

const MS_PER_DAY = 24 * 60 * 60 * 1000

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// U+2009 THIN SPACE, written as an escape rather than pasted literally: an
// invisible non-ASCII space in source is indistinguishable from a normal one
// when reading or editing, and lint rejects it outright (no-irregular-whitespace).
const THIN_SPACE = '\u2009'

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** Formats a Date as the local calendar day, `YYYY-MM-DD`. */
export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Today's local calendar day — the picker's default selection. */
export function todayKey(): string {
  return toDateKey(new Date())
}

/** True for a well-formed `YYYY-MM-DD` string that names a real calendar day. */
export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false

  // Round-tripping rejects impossible days (2026-02-31) that the regex allows.
  const parsed = parseDateKey(value)
  return parsed !== null && toDateKey(parsed) === value
}

/** Parses a `YYYY-MM-DD` key into a local-midnight Date, or null if malformed. */
export function parseDateKey(value: string): Date | null {
  if (!DATE_PATTERN.test(value)) return null

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)

  return Number.isNaN(date.getTime()) ? null : date
}

/** Shifts a date key by whole days; returns the key unchanged if malformed. */
export function shiftDateKey(value: string, days: number): string {
  const parsed = parseDateKey(value)
  if (!parsed) return value

  return toDateKey(new Date(parsed.getTime() + days * MS_PER_DAY))
}

/** True when the key names a day strictly before today — nothing to book there. */
export function isPastDateKey(value: string): boolean {
  return isDateKey(value) && value < todayKey()
}

/**
 * Human-readable date for headings and screen readers, e.g.
 * "Tuesday, 18 August 2026" / "יום שלישי, 18 באוגוסט 2026".
 */
export function formatDateLabel(value: string, locale: Locale): string {
  const parsed = parseDateKey(value)
  if (!parsed) return value

  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parsed)
}

/**
 * Renders a slot's window as a time range. The times are already wall-clock
 * `HH:mm` strings from the server, so they are shown as-is with a directional
 * separator rather than being re-parsed into a Date and re-localized — that
 * would only reintroduce a timezone that the API deliberately does not carry.
 */
export function formatTimeRange(startTime: string, endTime: string): string {
  return `${startTime}${THIN_SPACE}–${THIN_SPACE}${endTime}`
}

/**
 * Parses an ISO-8601 instant, or null if it is missing/unparseable. Used for the
 * one value in this app that genuinely is an instant rather than a wall-clock
 * time: a hold's expiry deadline.
 */
export function parseInstant(value: string | null | undefined): Date | null {
  if (typeof value !== 'string' || !value) return null

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Renders a remaining duration as `m:ss`, counting seconds up from zero rather
 * than down past it — a negative countdown is not a thing a Customer should
 * ever be shown. Minutes are not zero-padded (`4:05`, not `04:05`) so the
 * number reads as a plain quantity of time left.
 */
export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${pad(seconds)}`
}
