import type { SliceCreator } from '../store'
import type { Seat, SeatMap } from '../../types/seat.types'

/**
 * The seat map for the currently selected bus.
 *
 * Written by `seat.service.ts` after an API response — components must not
 * duplicate that update after calling the service (.rule/coding-rules.md).
 *
 * The server is the sole source of truth for seat state (PRD NFR): nothing here
 * may move a seat to a new status on its own. `applySeat` only writes back a
 * seat the server has already returned, and it is deliberately keyed by seat id
 * so a response that arrived late for a bus the user has since switched away
 * from is dropped rather than merged into the wrong map.
 */
export type SeatSlice = {
  seatMap: SeatMap | null
  setSeatMap: (seatMap: SeatMap | null) => void
  /** Replaces a single seat with the version the server just confirmed. */
  applySeat: (seat: Seat) => void
}

export const createSeatSlice: SliceCreator<SeatSlice> = (set, get) => ({
  seatMap: null,

  setSeatMap: (seatMap) => set({ seatMap }),

  applySeat: (seat) => {
    const current = get().seatMap
    if (!current || current.bus.id !== seat.busId) return

    set({
      seatMap: {
        ...current,
        seats: current.seats.map((existing) => (existing.id === seat.id ? seat : existing)),
      },
    })
  },
})
