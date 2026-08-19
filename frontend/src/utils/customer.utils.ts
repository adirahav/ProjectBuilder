import type { StringKey } from '../i18n/strings'
import type { CustomerDetails } from '../types/appointment.types'

/**
 * Client-side validation for the Customer contact form (PRD F4: name and phone
 * required, email optional).
 *
 * Kept out of the component on purpose: this is domain logic with real edge
 * cases, and it is the one part of the form worth testing directly rather than
 * through the DOM. It returns i18n *keys*, not sentences, so the same rules
 * render in Hebrew or English without this file knowing either language
 * (.rule/error-handling-rules.md — validation errors are inline copy, never a
 * raw message from anywhere).
 *
 * These rules are a courtesy to the Customer, not a security boundary: the
 * server validates independently and is the only side that can be trusted.
 */

export type CustomerField = keyof CustomerDetails

export type CustomerDetailsErrors = Partial<Record<CustomerField, StringKey>>

const NAME_MIN_LENGTH = 2
const NAME_MAX_LENGTH = 60

// Deliberately permissive: the clinic takes local mobiles, landlines and the
// occasional international number, and a stricter pattern would reject real
// customers to catch typos it cannot actually detect.
const PHONE_ALLOWED_PATTERN = /^[\d\s+()-]+$/
const PHONE_MIN_DIGITS = 9
const PHONE_MAX_DIGITS = 15

// Intentionally simple: an address is either obviously malformed or has to be
// proven by sending mail to it. Anything more elaborate only rejects valid
// addresses (plus-tags, long TLDs) while still not proving the address exists.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const EMAIL_MAX_LENGTH = 254

/** Number of digits in a phone string, ignoring spacing and punctuation. */
function countDigits(value: string): number {
  return (value.match(/\d/g) ?? []).length
}

/** Whitespace-trimmed copy of every field, as submitted to the API. */
export function normalizeCustomerDetails(details: CustomerDetails): CustomerDetails {
  return {
    customerName: details.customerName.trim(),
    customerPhone: details.customerPhone.trim(),
    customerEmail: details.customerEmail.trim(),
  }
}

/**
 * Validates one field. Exported so the form can re-check a single input after
 * it is corrected, without re-flagging the fields the Customer has not reached
 * yet — showing an error for an untouched field is how a form ends up shouting
 * at someone who has done nothing wrong.
 */
export function validateCustomerField(
  field: CustomerField,
  details: CustomerDetails,
): StringKey | undefined {
  const value = details[field].trim()

  if (field === 'customerName') {
    if (!value) return 'details.form.name.required'
    if (value.length < NAME_MIN_LENGTH) return 'details.form.name.tooShort'
    if (value.length > NAME_MAX_LENGTH) return 'details.form.name.tooLong'
    return undefined
  }

  if (field === 'customerPhone') {
    if (!value) return 'details.form.phone.required'
    if (!PHONE_ALLOWED_PATTERN.test(value)) return 'details.form.phone.invalid'

    const digits = countDigits(value)
    if (digits < PHONE_MIN_DIGITS || digits > PHONE_MAX_DIGITS) {
      return 'details.form.phone.invalid'
    }
    return undefined
  }

  // Email is optional (PRD F4): an empty value is valid and simply omitted from
  // the request. Only a non-empty value has to look like an address.
  if (!value) return undefined
  if (value.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(value)) {
    return 'details.form.email.invalid'
  }

  return undefined
}

/** Validates the whole form. An empty object means it is safe to submit. */
export function validateCustomerDetails(details: CustomerDetails): CustomerDetailsErrors {
  const errors: CustomerDetailsErrors = {}

  for (const field of ['customerName', 'customerPhone', 'customerEmail'] as const) {
    const error = validateCustomerField(field, details)
    if (error) errors[field] = error
  }

  return errors
}
