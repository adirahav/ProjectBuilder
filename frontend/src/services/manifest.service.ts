import type { Manifest } from '../types/manifest.types'
import { useStore } from '../store/store'
import { httpService } from './http.service'

/**
 * Passenger manifest service (`tour-service`, Screen 4c / F15).
 *
 * All requests go through `http.service.ts` — never `fetch` directly, and never
 * from a component. Errors propagate to the calling page/hook, which maps them
 * to hardcoded Hebrew copy (.rule/error-handling-rules.md).
 *
 * **PII / auth:** this is the one tour-service endpoint that intentionally
 * returns passenger identity, so it is the one place `withAuth` must stay `true`
 * — every other tour-service call in this app is a deliberately public,
 * unauthenticated passenger surface. The admin JWT is attached by
 * `http.service.ts`; server-side JWT verification is the real security boundary,
 * not the client-side admin guard (plan 009 §Assumptions).
 *
 * Nothing here is ever logged beyond ids and counts — a log line must never
 * carry a passenger's name or phone number.
 */

const SERVICE = 'tour-service' as const

/**
 * Fetches the full manifest for a bus (`GET /api/buses/:busId/manifest`).
 *
 * As with the seat map, the response is only written to the store while `busId`
 * is still the selected bus: a slow response for a bus the admin has already
 * switched away from would otherwise land as the manifest for the new bus — and
 * with PII, that is a disclosure bug, not just a stale-render bug.
 */
async function getManifest(busId: string, signal?: AbortSignal): Promise<Manifest> {
  const manifest = await httpService.get<Manifest>(
    `/api/buses/${encodeURIComponent(busId)}/manifest`,
    { service: SERVICE, withAuth: true, signal },
  )

  const { selectedBusId, setManifest } = useStore.getState()
  if (selectedBusId === busId) {
    // The service updates the store directly; the component must not repeat this.
    setManifest(manifest)
  }
  console.log('[MANIFEST] loaded manifest', busId, manifest.rows.length)

  return manifest
}

export const manifestService = {
  getManifest,
}
