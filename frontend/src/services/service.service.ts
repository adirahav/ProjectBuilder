import axios from 'axios'

// Namespace import on purpose, matching auth.service.ts: reading a named
// binding at module scope would make this module fail to load the moment a test
// partially mocks http.service. Every access below happens inside a function.
import * as http from './http.service'
import { validateServiceForm } from '../utils/service.utils'
import type { Service, ServiceDraft, ServicePatch } from '../types/service.types'

// Public endpoint mirrors docs/api-contract/api-contract.booking-service.yaml.
const BASE_URL = '/api/services'

// Admin endpoints mirror docs/api-contract/api-contract.api-gateway.yaml. Same
// path prefix, different origin: these go through api-gateway, which is where
// the JWT is verified (PRD F6-F8, "via api-gateway"). The public list above
// still talks to booking-service directly and stays unauthenticated.
const ADMIN_LIST_URL = `${BASE_URL}/all`

// Public, unauthenticated (PRD F1). booking-service filters to isActive: true
// server-side; the defensive filter below only guards against a backend that
// starts returning inactive records, so a deactivated Service can never leak
// onto the customer-facing list (PRD AC-4).
async function getList(): Promise<Service[]> {
  const services = await http.httpService.get<Service[]>(BASE_URL)

  if (!Array.isArray(services)) {
    console.log('[SERVICE] unexpected services payload shape')
    return []
  }

  return services.filter((service) => service.isActive !== false)
}

/**
 * The Admin list (PRD F6-F8): every Service, active and deactivated alike.
 * Deliberately a separate path from the public one rather than a query flag on
 * it — a soft-deleted Service must not be one misread parameter away from the
 * customer-facing list (plan 012, Open Question 1).
 *
 * No filtering happens here, unlike `getList`: showing the inactive records is
 * the entire point of this screen.
 */
async function getAllList(): Promise<Service[]> {
  const services = await http.gatewayHttpService.get<Service[]>(ADMIN_LIST_URL)

  if (!Array.isArray(services)) {
    console.log('[SERVICE] unexpected admin services payload shape')
    return []
  }

  return services
}

/**
 * Creates a Service (PRD F6). It is always created active — the draft type
 * carries no `isActive`, so there is no way to ask for an invisible record.
 *
 * Validation runs again here even though the form already ran it: sending a
 * request that cannot succeed is a bug on our side, and refusing to send it is
 * cheaper and clearer than letting the gateway answer 400
 * (.rule/error-handling-rules.md, "fail fast on invalid input").
 */
async function create(draft: ServiceDraft): Promise<Service> {
  assertValidDraft(draft)

  return http.gatewayHttpService.post<Service>(BASE_URL, draft)
}

/**
 * Edits a Service (PRD F7). PATCH, not PUT, and only the changed fields: the
 * server applies exactly what it is given, so an omitted field is left alone
 * rather than being blanked.
 *
 * This is also the only route back from a deactivation — `isActive: true` is a
 * legal patch (plan 012, Open Question 3).
 */
async function update(id: string, patch: ServicePatch): Promise<Service> {
  if (!id) {
    console.log('[SERVICE] refusing to update a Service without an id')
    throw new Error('Missing service id')
  }

  if (Object.keys(patch).length === 0) {
    console.log('[SERVICE] refusing to send an empty Service patch')
    throw new Error('Empty service patch')
  }

  assertValidPatch(patch)

  return http.gatewayHttpService.patch<Service>(`${BASE_URL}/${id}`, patch)
}

/**
 * Deactivates a Service (PRD F8) — a soft delete, never a hard one. The record
 * survives so the Appointments already booked against it stay readable; it
 * simply stops appearing on the public list.
 *
 * Its own endpoint rather than `update(id, { isActive: false })` so the intent
 * is explicit in the server's routing and its logs.
 */
async function deactivate(id: string): Promise<Service> {
  if (!id) {
    console.log('[SERVICE] refusing to deactivate a Service without an id')
    throw new Error('Missing service id')
  }

  return http.gatewayHttpService.patch<Service>(`${BASE_URL}/${id}/deactivate`)
}

/**
 * HTTP status booking-service returns when the Service being written no longer
 * exists — another Admin, or another tab, removed it between this list being
 * loaded and the write being sent.
 */
export const SERVICE_NOT_FOUND_STATUS = 404

/**
 * True for the one write failure that is not a fault: the record is gone. The
 * page maps it to "that service no longer exists" and re-loads the list, rather
 * than to a generic "try again" that would never succeed
 * (.rule/error-handling-rules.md).
 */
export function isMissingServiceError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === SERVICE_NOT_FOUND_STATUS
}

/** Re-runs the form rules against an outgoing create payload. */
function assertValidDraft(draft: ServiceDraft): void {
  const errors = validateServiceForm({
    name: draft.name,
    durationMinutes: String(draft.durationMinutes),
    price: String(draft.price),
    isActive: true,
  })

  if (Object.keys(errors).length > 0) {
    console.log('[SERVICE] refusing to send an invalid Service')
    throw new Error('Invalid service')
  }
}

/** Re-runs the form rules against the subset of fields a patch actually carries. */
function assertValidPatch(patch: ServicePatch): void {
  const values = {
    name: patch.name ?? 'placeholder',
    durationMinutes: String(patch.durationMinutes ?? 1),
    price: String(patch.price ?? 0),
    isActive: patch.isActive ?? true,
  }

  const errors = validateServiceForm(values)
  const offending = (['name', 'durationMinutes', 'price'] as const).filter(
    (field) => patch[field] !== undefined && errors[field],
  )

  if (offending.length > 0) {
    console.log('[SERVICE] refusing to send an invalid Service patch')
    throw new Error('Invalid service patch')
  }
}

export const serviceService = {
  getList,
  getAllList,
  create,
  update,
  deactivate,
}
