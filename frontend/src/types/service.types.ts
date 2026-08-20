// Mirrors the Service schema in docs/api-contract/api-contract.booking-service.yaml.
// The client-facing identifier is always `id` (a uuid string) — Mongo's `_id` is
// an internal backend detail and must never appear here (.rule/naming-rules.md).
export interface Service {
  id: string
  name: string
  durationMinutes: number
  price: number
  isActive: boolean
}

/**
 * What the Admin create form submits (PRD F6). `isActive` is deliberately
 * absent: a newly created Service is always active, and letting the client ask
 * for an inactive one would only create a record nobody can see or reach.
 */
export interface ServiceDraft {
  name: string
  durationMinutes: number
  price: number
}

/**
 * What the Admin edit form submits (PRD F7). Every field is optional because
 * the server applies only the ones actually present — sending the whole record
 * back would silently overwrite a field another Admin changed meanwhile.
 *
 * `isActive` is patchable here on purpose: deactivation has its own endpoint,
 * but re-activating a soft-deleted Service has none, so the edit form is the
 * only way back (plan 012, Open Question 3).
 */
export type ServicePatch = Partial<ServiceDraft & { isActive: boolean }>

/**
 * The form's own shape. Numbers live as strings while the Admin is typing —
 * an empty duration field is "" and not `NaN`, so "you have not filled this in"
 * stays distinguishable from "you typed something that is not a number".
 */
export interface ServiceFormValues {
  name: string
  durationMinutes: string
  price: string
  isActive: boolean
}

export type ServiceFormField = keyof ServiceFormValues
