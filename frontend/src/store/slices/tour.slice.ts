import type { SliceCreator } from '../store'
import type { Tour } from '../../types/tour.types'

/**
 * Tour list + the passenger's current tour selection (Screen 3's selector).
 *
 * Written by `tour.service.ts` after an API response — components must not
 * duplicate that update after calling the service (.rule/coding-rules.md).
 *
 * Selecting a tour cascades: the bus list, the bus selection, the seat map, and
 * the admin manifest all belong to the previously selected tour, so they are
 * cleared here in the same `set` call. Doing it anywhere else would leave one
 * render in which the map on screen belongs to a tour the user is no longer
 * looking at — and, for the manifest, one render of another bus's passenger PII.
 */
export type TourSlice = {
  tours: Tour[]
  selectedTourId: string | null
  setTours: (tours: Tour[]) => void
  selectTour: (tourId: string | null) => void
}

export const createTourSlice: SliceCreator<TourSlice> = (set) => ({
  tours: [],
  selectedTourId: null,

  setTours: (tours) => set({ tours }),

  selectTour: (tourId) =>
    set({
      selectedTourId: tourId,
      buses: [],
      selectedBusId: null,
      seatMap: null,
      manifest: null,
    }),
})
