import type { StringKey } from '../i18n/strings'
import type {
  Service,
  ServiceDraft,
  ServiceFormField,
  ServiceFormValues,
  ServicePatch,
} from '../types/service.types'

/**
 * Client-side validation and form/payload conversion for the Admin Service form
 * (PRD F6/F7).
 *
 * Rules live here rather than in the component so the same checks can run on
 * blur, on submit, and in the service layer before a request is ever sent
 * (.rule/error-handling-rules.md, "fail fast on invalid input"). They return
 * i18n *keys*, never sentences, so this file stays language-agnostic.
 *
 * These are a courtesy, not a boundary: booking-service validates independently
 * and is the only side that decides whether a write is accepted.
 */

export const SERVICE_NAME_MAX_LENGTH = 60

/** A whole working day. Longer is far likelier to be a typo (600 for 60) than a
 * real treatment, and a bad duration silently poisons every TimeSlot generated
 * from it. */
export const SERVICE_DURATION_MAX_MINUTES = 480

/** A generous ceiling for a grooming treatment, again aimed at catching a
 * misplaced digit rather than at policing the clinic's pricing. */
export const SERVICE_PRICE_MAX = 100_000

export type ServiceFormErrors = Partial<Record<ServiceFormField, StringKey>>

/** The empty create form: a new Service is always active. */
export function emptyServiceFormValues(): ServiceFormValues {
  return { name: '', durationMinutes: '', price: '', isActive: true }
}

/** An existing Service as the edit form shows it. */
export function serviceToFormValues(service: Service): ServiceFormValues {
  return {
    name: service.name,
    durationMinutes: String(service.durationMinutes),
    price: String(service.price),
    isActive: service.isActive,
  }
}

/**
 * Parses a typed number field. Returns `undefined` for anything that is not a
 * finite number, including the empty string — `Number('')` is 0, which would
 * quietly turn a blank price into a free treatment.
 */
function parseNumeric(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Validates one field. Exported so the form can check a single input on blur
 * without flagging fields the Admin has not reached yet.
 */
export function validateServiceField(
  field: ServiceFormField,
  values: ServiceFormValues,
): StringKey | undefined {
  if (field === 'name') {
    const name = values.name.trim()
    if (!name) return 'adminServices.form.name.required'
    if (name.length > SERVICE_NAME_MAX_LENGTH) return 'adminServices.form.name.tooLong'
    return undefined
  }

  if (field === 'durationMinutes') {
    const duration = parseNumeric(values.durationMinutes)
    if (duration === undefined) return 'adminServices.form.duration.required'
    // Half-minute treatments are not a thing, and a fractional duration would
    // make every generated TimeSlot boundary land off the clock.
    if (!Number.isInteger(duration) || duration <= 0)
      return 'adminServices.form.duration.invalid'
    if (duration > SERVICE_DURATION_MAX_MINUTES) return 'adminServices.form.duration.tooLong'
    return undefined
  }

  if (field === 'price') {
    const price = parseNumeric(values.price)
    if (price === undefined) return 'adminServices.form.price.required'
    // Zero is allowed on purpose: a complimentary treatment is legitimate.
    if (price < 0) return 'adminServices.form.price.invalid'
    if (price > SERVICE_PRICE_MAX) return 'adminServices.form.price.tooHigh'
    return undefined
  }

  return undefined
}

/** Validates the whole form. An empty object means it is safe to submit. */
export function validateServiceForm(values: ServiceFormValues): ServiceFormErrors {
  const errors: ServiceFormErrors = {}

  for (const field of ['name', 'durationMinutes', 'price'] as const) {
    const error = validateServiceField(field, values)
    if (error) errors[field] = error
  }

  return errors
}

/**
 * The create payload. Assumes the values already passed validation — the caller
 * short-circuits on errors, so this never has to invent a fallback number.
 */
export function toServiceDraft(values: ServiceFormValues): ServiceDraft {
  return {
    name: values.name.trim(),
    durationMinutes: Number(values.durationMinutes.trim()),
    price: Number(values.price.trim()),
  }
}

/**
 * The edit payload: only what actually changed. Sending the untouched fields
 * back would overwrite whatever another Admin edited in the meantime, and would
 * make a no-op "Save" indistinguishable from a real edit in the server's logs.
 * An empty object is a valid result and means there is nothing to send.
 */
export function toServicePatch(values: ServiceFormValues, original: Service): ServicePatch {
  const draft = toServiceDraft(values)
  const patch: ServicePatch = {}

  if (draft.name !== original.name) patch.name = draft.name
  if (draft.durationMinutes !== original.durationMinutes) {
    patch.durationMinutes = draft.durationMinutes
  }
  if (draft.price !== original.price) patch.price = draft.price
  if (values.isActive !== original.isActive) patch.isActive = values.isActive

  return patch
}

/** True when the edit form would send nothing — the Save button says so instead
 * of firing a pointless request. */
export function isEmptyServicePatch(patch: ServicePatch): boolean {
  return Object.keys(patch).length === 0
}

/** Active Services first, then alphabetical, so the list an Admin works with
 * most sits at the top and deactivated records sink out of the way without
 * disappearing. */
export function sortServicesForAdmin(services: Service[]): Service[] {
  return [...services].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}
