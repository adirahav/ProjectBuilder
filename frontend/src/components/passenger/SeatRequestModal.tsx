import { useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { Modal } from '../Modal'
import { TextField } from '../form/TextField'
import { SelectField } from '../form/SelectField'
import { cn } from '../../lib/utils'
import type {
  Seat,
  SeatRequestFieldErrors,
  SeatRequestFormValues,
} from '../../types/seat.types'
import {
  hasSeatFieldErrors,
  seatStatusIcons,
  seatStatusLabels,
  seatStatusStyles,
  validatePhone,
  validatePickupPoint,
  validateSeatFullName,
  validateSeatRequest,
} from '../../utils/seat.utils'

/**
 * Seat-request modal (F4, mockup §SEAT REQUEST MODAL).
 *
 * Presentational + validation only: it collects the three fields, validates
 * them client-side, and hands them to the page, which owns the service call and
 * the mandatory seat-map refresh. That split keeps the "always re-sync after a
 * `seat` action" rule (.rule/error-handling-rules.md) in one place instead of
 * duplicating it per outcome here.
 *
 * Validation errors render inline under their field — never as a toast; toasts
 * are reserved for outcomes that needed a round-trip to the server.
 *
 * The page mounts this with a `key` of the seat id, so opening a different seat
 * remounts it with empty fields. That is deliberately not an effect: resetting
 * form state by remount avoids the extra render pass a "clear on seat change"
 * effect would cause, and makes it impossible for one seat's typed-in details to
 * survive into a request for another.
 */

const EMPTY_FORM: SeatRequestFormValues = { fullName: '', phone: '', pickupPoint: '' }

type SeatRequestModalProps = {
  /** The seat being requested; `null` closes the modal. */
  seat: Seat | null
  /** Context line under the title, e.g. `הגליל העליון · אוטובוס 1`. */
  contextLabel: string
  pickupPoints: string[]
  isSubmitting: boolean
  /**
   * Server-side outcome shown inside the dialog (e.g. the 409 conflict), so the
   * reason the modal stayed open is visible right where the user is looking.
   */
  submitError?: string
  onSubmit: (values: SeatRequestFormValues) => void
  onClose: () => void
}

export function SeatRequestModal({
  seat,
  contextLabel,
  pickupPoints,
  isSubmitting,
  submitError,
  onSubmit,
  onClose,
}: SeatRequestModalProps) {
  // A single pickup point is pre-selected: there is nothing to choose.
  const [values, setValues] = useState<SeatRequestFormValues>(() => ({
    ...EMPTY_FORM,
    pickupPoint: pickupPoints.length === 1 ? pickupPoints[0] : '',
  }))
  const [errors, setErrors] = useState<SeatRequestFieldErrors>({})

  if (!seat) return null

  const StatusIcon = seatStatusIcons[seat.status]

  function setField(field: keyof SeatRequestFormValues, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }))
    // Clear the field's error as soon as the user starts correcting it.
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev))
  }

  function setFieldError(field: keyof SeatRequestFormValues, error: string | undefined) {
    setErrors((prev) => ({ ...prev, [field]: error }))
  }

  function handleSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    if (isSubmitting) return

    // Client-side validation runs first and short-circuits with inline errors.
    const fieldErrors = validateSeatRequest(values)
    setErrors(fieldErrors)
    if (hasSeatFieldErrors(fieldErrors)) return

    onSubmit(values)
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`בקשת מושב ${seat.label}`}
      description={contextLabel}
    >
      <div className="mt-4 flex items-center gap-3 rounded-lg bg-primary-100 p-3">
        <span
          aria-hidden="true"
          className={cn(
            'flex size-11 shrink-0 flex-col items-center justify-center gap-px rounded-lg border-2 text-caption font-semibold',
            seatStatusStyles[seat.status],
          )}
        >
          <StatusIcon className="size-3" />
          <span className="numeral">{seat.label}</span>
        </span>
        <p className="text-label text-primary-900">
          המושב במצב <strong>{seatStatusLabels[seat.status]}</strong>. לאחר השליחה הוא יעבור
          לסטטוס <strong>ממתין לאישור</strong> עד לאישור המנהל.
        </p>
      </div>

      <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <TextField
          id="seat-request-full-name"
          label="שם מלא"
          value={values.fullName}
          onChange={(value) => setField('fullName', value)}
          onBlur={() => setFieldError('fullName', validateSeatFullName(values.fullName))}
          autoComplete="name"
          error={errors.fullName}
          disabled={isSubmitting}
        />

        <TextField
          id="seat-request-phone"
          label="טלפון"
          value={values.phone}
          onChange={(value) => setField('phone', value)}
          onBlur={() => setFieldError('phone', validatePhone(values.phone))}
          autoComplete="tel"
          placeholder="050-0000000"
          isNumeral
          error={errors.phone}
          disabled={isSubmitting}
        />

        <SelectField
          id="seat-request-pickup-point"
          label="נקודת איסוף"
          value={values.pickupPoint}
          onChange={(value) => setField('pickupPoint', value)}
          onBlur={() => setFieldError('pickupPoint', validatePickupPoint(values.pickupPoint))}
          options={pickupPoints.map((point) => ({ value: point, label: point }))}
          placeholder="בחרו נקודת איסוף"
          hint="נקודות האיסוף מוגדרות לכל אוטובוס בנפרד."
          error={errors.pickupPoint}
          disabled={isSubmitting || pickupPoints.length === 0}
        />

        {submitError ? (
          <p
            role="alert"
            className="rounded-lg bg-danger-50 p-3 text-caption font-medium text-danger-600"
          >
            {submitError}
          </p>
        ) : null}

        <div className="mt-2 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className={cn(
              'rounded-lg px-4 py-2 text-label font-medium text-primary-700 transition hover:bg-primary-100',
              isSubmitting && 'cursor-not-allowed opacity-45',
            )}
          >
            ביטול
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className={cn(
              'flex h-10 items-center justify-center gap-2 rounded-lg bg-accent-500 px-4',
              'text-label font-semibold text-n-0 transition hover:brightness-95',
              isSubmitting && 'cursor-not-allowed opacity-45',
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                שולח…
              </>
            ) : (
              'שליחת בקשה'
            )}
          </button>
        </div>
      </form>
    </Modal>
  )
}
