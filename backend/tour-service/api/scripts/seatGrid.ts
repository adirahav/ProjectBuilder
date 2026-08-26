export type SeatPosition = { row: number; column: number; label: string }

export type LayoutTemplate = {
  rows: number
  columns: number
  aisleAfterColumn: number
  /** Row whose aisle-side seats are replaced by the boarding door. */
  doorRow: number
  /** Full-width rear bench: it spans the aisle, so it gets its own seat count. */
  backRowSeatCount: number
}

export const DEFAULT_LAYOUT: LayoutTemplate = {
  rows: 13,
  columns: 4,
  aisleAfterColumn: 2,
  doorRow: 3,
  backRowSeatCount: 5,
}

/**
 * Expands a layout template into concrete seat positions. Labels are assigned
 * sequentially in render order, so seat `1` is the front-most seat.
 *
 * Kept as a pure function so the seed script and the tests build identical
 * grids without duplicating the rules.
 */
export function buildSeatGrid(layout: LayoutTemplate): SeatPosition[] {
  const positions: SeatPosition[] = []
  let label = 1

  for (let row = 1; row <= layout.rows; row++) {
    if (row === layout.rows) {
      // Rear bench spans the aisle.
      for (let column = 1; column <= layout.backRowSeatCount; column++) {
        positions.push({ row, column, label: String(label++) })
      }
      continue
    }

    for (let column = 1; column <= layout.columns; column++) {
      // The door occupies the space where this row's door-side seats would be.
      if (row === layout.doorRow && column <= layout.aisleAfterColumn) continue
      positions.push({ row, column, label: String(label++) })
    }
  }

  return positions
}
