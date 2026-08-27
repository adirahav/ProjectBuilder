import type { SliceCreator } from '../store'
import type { Manifest } from '../../types/manifest.types'

/**
 * The passenger manifest for the currently selected bus (Screen 4c / F15).
 *
 * Written by `manifest.service.ts` after an API response — components must not
 * duplicate that update after calling the service (.rule/coding-rules.md).
 *
 * Kept in its own slice rather than folded into `seat.slice.ts` on purpose: the
 * manifest carries passenger PII and comes from an admin-authenticated
 * endpoint, while `seatMap` comes from a public one. Keeping the two apart makes
 * it impossible for a passenger-facing component to read PII out of the store by
 * accident, and lets the manifest be cleared independently on logout.
 *
 * `selectTour`/`selectBus` clear this for the same reason they clear `seatMap`:
 * a manifest belonging to another bus must never be on screen, even for a single
 * render — and stale PII in particular must not outlive its context.
 */
export type ManifestSlice = {
  manifest: Manifest | null
  setManifest: (manifest: Manifest | null) => void
}

export const createManifestSlice: SliceCreator<ManifestSlice> = (set) => ({
  manifest: null,

  setManifest: (manifest) => set({ manifest }),
})
