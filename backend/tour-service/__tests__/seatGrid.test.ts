import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYOUT, buildSeatGrid } from '../api/scripts/seatGrid.js'

describe('buildSeatGrid', () => {
  const grid = buildSeatGrid(DEFAULT_LAYOUT)

  it('omits the door-side seats on the door row', () => {
    const doorRowColumns = grid
      .filter((s) => s.row === DEFAULT_LAYOUT.doorRow)
      .map((s) => s.column)

    expect(doorRowColumns).toEqual([3, 4])
  })

  it('gives the rear bench its own full-width seat count', () => {
    const backRow = grid.filter((s) => s.row === DEFAULT_LAYOUT.rows)

    expect(backRow).toHaveLength(DEFAULT_LAYOUT.backRowSeatCount)
  })

  it('labels seats sequentially from the front, with no gaps or duplicates', () => {
    const labels = grid.map((s) => s.label)

    expect(labels).toEqual(grid.map((_, i) => String(i + 1)))
    expect(new Set(labels).size).toBe(grid.length)
  })

  it('produces a unique row/column for every seat', () => {
    const keys = grid.map((s) => `${s.row}:${s.column}`)

    expect(new Set(keys).size).toBe(grid.length)
  })
})
