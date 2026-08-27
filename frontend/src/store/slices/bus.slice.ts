import type { SliceCreator } from '../store'
import type { Bus } from '../../types/bus.types'

/**
 * Bus list for the selected tour + the passenger's current bus selection.
 *
 * Written by `bus.service.ts` after an API response — components must not
 * duplicate that update after calling the service (.rule/coding-rules.md).
 *
 * Changing the bus clears the seat map and the admin manifest for the same
 * reason `selectTour` clears the bus list: stale data belonging to another bus
 * must never be on screen, even for a single render — and the manifest's
 * passenger PII in particular must not outlive the bus it describes.
 */
export type BusSlice = {
  buses: Bus[]
  selectedBusId: string | null
  setBuses: (buses: Bus[]) => void
  selectBus: (busId: string | null) => void
}

export const createBusSlice: SliceCreator<BusSlice> = (set) => ({
  buses: [],
  selectedBusId: null,

  setBuses: (buses) => set({ buses }),

  selectBus: (busId) => set({ selectedBusId: busId, seatMap: null, manifest: null }),
})
