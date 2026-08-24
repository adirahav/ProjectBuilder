import { create } from 'zustand'

/**
 * The single global Zustand store, assembled from one slice per feature
 * (`tour`, `bus`, `busType`, `seat`, `auth`).
 *
 * Slices live in `src/store/slices/<domain>.slice.ts` and are created with the
 * `SliceCreator` helper below, then spread into the store here. No slices exist
 * yet — feature tickets add them.
 *
 * Note: services update this store directly after an API response. Components
 * must not duplicate that update after calling a service.
 */

/** Union of every slice's state. Feature tickets intersect their slice type in. */
export type StoreState = Record<never, never>

/**
 * Signature every slice creator must use, so slices can read/write across the
 * assembled store once more than one exists.
 */
export type SliceCreator<TSlice> = (
  set: (partial: Partial<StoreState>) => void,
  get: () => StoreState,
) => TSlice

export const useStore = create<StoreState>()(() => ({
  // ...spread slices here, e.g. ...createSeatSlice(set, get)
}))
