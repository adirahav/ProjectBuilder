import { create } from 'zustand'
import { createAuthSlice, type AuthSlice } from './slices/auth.slice'

/**
 * The single global Zustand store, assembled from one slice per feature
 * (`tour`, `bus`, `busType`, `seat`, `auth`).
 *
 * Slices live in `src/store/slices/<domain>.slice.ts` and are created with the
 * `SliceCreator` helper below, then spread into the store here.
 *
 * Note: services update this store directly after an API response. Components
 * must not duplicate that update after calling a service.
 */

/** Union of every slice's state. Feature tickets intersect their slice type in. */
export type StoreState = AuthSlice

/**
 * Signature every slice creator must use, so slices can read/write across the
 * assembled store once more than one exists.
 */
export type SliceCreator<TSlice> = (
  set: (partial: Partial<StoreState>) => void,
  get: () => StoreState,
) => TSlice

export const useStore = create<StoreState>()((set, get) => ({
  ...createAuthSlice(set, get),
}))
