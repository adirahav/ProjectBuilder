import { describe, expect, it } from 'vitest'
import type { Manifest, ManifestRow } from '../types/manifest.types'
import {
  countManifestByStatus,
  filterManifestRows,
  formatManifestReport,
  sortManifestRows,
} from './manifest.utils'

/**
 * Manifest filtering and report formatting (F15/F16, AC-14).
 *
 * The report format is the contract with the admin's WhatsApp/print workflow
 * (plan 009, Open Question 2), so it is asserted on content rather than on an
 * exact snapshot — the grouping and the details must hold, the exact spacing is
 * free to change.
 */

function buildRow(overrides: Partial<ManifestRow> = {}): ManifestRow {
  return {
    seatId: 's1',
    seatLabel: '1',
    status: 'taken',
    fullName: 'נועה לוי',
    phone: '0524471903',
    pickupPoint: 'צומת גלילות',
    ...overrides,
  }
}

const BUS: Manifest['bus'] = { id: 'b1', name: 'אוטובוס 1', seatCount: 4 }

const ROWS: ManifestRow[] = [
  buildRow({ seatId: 's1', seatLabel: '1', status: 'taken', fullName: 'נועה לוי' }),
  buildRow({
    seatId: 's2',
    seatLabel: '2',
    status: 'pending',
    fullName: 'דנה כהן',
    phone: '0501112233',
    pickupPoint: 'תחנה מרכזית תל אביב',
  }),
  buildRow({
    seatId: 's3',
    seatLabel: '3',
    status: 'available',
    fullName: null,
    phone: null,
    pickupPoint: null,
  }),
  buildRow({
    seatId: 's4',
    seatLabel: '4',
    status: 'reserved',
    fullName: null,
    phone: null,
    pickupPoint: null,
  }),
]

describe('filterManifestRows', () => {
  it('returns every row when nothing is filtered', () => {
    expect(filterManifestRows(ROWS, { status: 'all', query: '' })).toHaveLength(4)
  })

  it('narrows to a single status', () => {
    const result = filterManifestRows(ROWS, { status: 'pending', query: '' })

    expect(result).toHaveLength(1)
    expect(result[0].seatId).toBe('s2')
  })

  it('matches a passenger name', () => {
    const result = filterManifestRows(ROWS, { status: 'all', query: 'דנה' })

    expect(result.map((row) => row.seatId)).toEqual(['s2'])
  })

  it('matches a pickup point', () => {
    const result = filterManifestRows(ROWS, { status: 'all', query: 'גלילות' })

    expect(result.map((row) => row.seatId)).toEqual(['s1'])
  })

  it('matches a phone number typed with separators against stored digits', () => {
    const result = filterManifestRows(ROWS, { status: 'all', query: '052-447' })

    expect(result.map((row) => row.seatId)).toEqual(['s1'])
  })

  it('combines the status filter and the query rather than choosing one', () => {
    const result = filterManifestRows(ROWS, { status: 'taken', query: 'דנה' })

    // דנה is `pending`, so no row satisfies both conditions.
    expect(result).toHaveLength(0)
  })

  it('returns nothing when the query matches no row', () => {
    expect(filterManifestRows(ROWS, { status: 'all', query: 'אין כזה' })).toHaveLength(0)
  })

  it('ignores a whitespace-only query', () => {
    expect(filterManifestRows(ROWS, { status: 'all', query: '   ' })).toHaveLength(4)
  })
})

describe('countManifestByStatus', () => {
  it('counts every status, including the ones with no rows', () => {
    expect(countManifestByStatus(ROWS)).toEqual({
      available: 1,
      pending: 1,
      taken: 1,
      reserved: 1,
    })
  })
})

describe('sortManifestRows', () => {
  it('orders occupied seats before free ones, then by seat number', () => {
    const rows = [
      buildRow({ seatId: 'a', seatLabel: '10', status: 'available' }),
      buildRow({ seatId: 'b', seatLabel: '2', status: 'taken' }),
      buildRow({ seatId: 'c', seatLabel: '10', status: 'taken' }),
    ]

    expect(sortManifestRows(rows).map((row) => row.seatId)).toEqual(['b', 'c', 'a'])
  })

  it('does not mutate the array it was given', () => {
    const rows = [...ROWS]
    sortManifestRows(rows)

    expect(rows.map((row) => row.seatId)).toEqual(['s1', 's2', 's3', 's4'])
  })
})

describe('formatManifestReport', () => {
  it('groups rows under a Hebrew status heading with a count', () => {
    const report = formatManifestReport(BUS, ROWS)

    expect(report).toContain('תפוס (1)')
    expect(report).toContain('ממתין לאישור (1)')
  })

  it('lists the passenger details of an occupied seat', () => {
    const report = formatManifestReport(BUS, ROWS)

    expect(report).toContain('1. נועה לוי - 0524471903 - צומת גלילות')
  })

  it('summarizes free seats as numbers rather than listing empty rows', () => {
    const report = formatManifestReport(BUS, ROWS)

    expect(report).toContain('פנוי (1)')
    expect(report).toContain('מושבים: 3')
  })

  it('names the bus and totals the rows against the bus capacity', () => {
    const report = formatManifestReport(BUS, ROWS)

    expect(report).toContain('רשימת נוסעים — אוטובוס 1')
    expect(report).toContain('סה"כ 4 מתוך 4 מושבים')
  })

  it('omits a status heading entirely when no row carries it', () => {
    const report = formatManifestReport(BUS, [ROWS[0]])

    expect(report).not.toContain('ממתין לאישור')
    expect(report).toContain('סה"כ 1 מתוך 4 מושבים')
  })

  it('reports only the rows it was given, so a filtered copy stays filtered', () => {
    const visible = filterManifestRows(ROWS, { status: 'pending', query: '' })
    const report = formatManifestReport(BUS, visible)

    expect(report).toContain('דנה כהן')
    expect(report).not.toContain('נועה לוי')
  })
})
