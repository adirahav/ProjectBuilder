import { useEffect, useMemo, useState } from 'react'

import { appointmentService, isAppointmentNotFoundError } from '../services/appointment.service'
import { useStore } from '../store/store'
import type { AppointmentReceipt } from '../types/appointment.types'

/**
 * What the confirmation page should render. Modelled as one value rather than a
 * pile of booleans so the page cannot accidentally show two states at once.
 *
 * `ready`     — a receipt is in hand, from either source.
 * `loading`   — the fallback fetch is in flight.
 * `notFound`  — there is no such booking (bad/stale id, or no id at all).
 * `error`     — the lookup failed for a reason that might not repeat.
 */
export type ReceiptState = 'ready' | 'loading' | 'notFound' | 'error'

export interface BookingReceiptResult {
  receipt: AppointmentReceipt | null
  state: ReceiptState
  /** Re-runs the fallback fetch after a failure that may not repeat. */
  retry: () => void
}

/**
 * Resolves the receipt for Screen 4 from whichever source can answer.
 *
 * 1. The Appointment the Customer just created is already in the store, so the
 *    common path — book, land here — renders instantly with no request at all.
 *    It is enriched from the Service list and the held slot the flow already
 *    loaded.
 * 2. On a reload, a bookmark, or a link opened later, that memory is gone. The
 *    id in the URL is then the only thing left, and the receipt is re-fetched
 *    by it. PRD Screen 4 calls this page the Customer's only receipt, so it has
 *    to survive a refresh rather than evaporate.
 *
 * The store copy is only trusted when its id matches the one in the URL: a
 * previous booking left in memory must never be presented as the one the URL
 * names.
 *
 * Deliberately local state, not a slice — a receipt is read once by one page
 * and nothing else in the app shares it.
 */
export function useBookingReceipt(appointmentId: string | undefined): BookingReceiptResult {
  const appointment = useStore((state) => state.appointment)
  const heldSlot = useStore((state) => state.heldSlot)
  const services = useStore((state) => state.services)

  const localReceipt = useMemo<AppointmentReceipt | null>(() => {
    if (!appointment) return null
    // An id in the URL is authoritative about *which* booking this page shows.
    if (appointmentId && appointment.id !== appointmentId) return null

    const service = services.find((candidate) => candidate.id === appointment.serviceId)
    const slot = heldSlot?.id === appointment.timeSlotId ? heldSlot : undefined

    return {
      ...appointment,
      ...(service
        ? {
            service: {
              name: service.name,
              durationMinutes: service.durationMinutes,
              price: service.price,
            },
          }
        : {}),
      ...(slot
        ? { timeSlot: { date: slot.date, startTime: slot.startTime, endTime: slot.endTime } }
        : {}),
    }
  }, [appointment, appointmentId, heldSlot, services])

  /**
   * The outcome of one fetch attempt, stamped with the attempt it answers. The
   * stamp is what makes "still loading" a *derived* fact rather than a flag
   * that has to be reset — a result from attempt 0 simply stops counting once
   * attempt 1 is under way, so no state is written while rendering.
   */
  const [outcome, setOutcome] = useState<{
    attempt: number
    state: Exclude<ReceiptState, 'loading'>
    receipt: AppointmentReceipt | null
  } | null>(null)
  const [attempt, setAttempt] = useState(0)

  const hasLocalReceipt = localReceipt !== null

  useEffect(() => {
    // Nothing to fetch: either the answer is already here, or there is no id to
    // ask about — a confirmation URL without one has no booking to show at all.
    if (hasLocalReceipt || !appointmentId) return

    let isCurrent = true

    appointmentService
      .getReceipt(appointmentId)
      .then((receipt) => {
        if (isCurrent) setOutcome({ attempt, state: 'ready', receipt })
      })
      .catch((err: unknown) => {
        if (!isCurrent) return

        const isMissing = isAppointmentNotFoundError(err)
        console.log(
          isMissing
            ? '[APPOINTMENT] no booking exists for the id on the confirmation page'
            : '[APPOINTMENT] re-loading the booking receipt failed',
        )

        setOutcome({ attempt, state: isMissing ? 'notFound' : 'error', receipt: null })
      })

    // A late response from a superseded id must never overwrite the current one.
    return () => {
      isCurrent = false
    }
  }, [appointmentId, hasLocalReceipt, attempt])

  const current = outcome?.attempt === attempt ? outcome : null
  const receipt = localReceipt ?? current?.receipt ?? null

  const state: ReceiptState = receipt
    ? 'ready'
    : !appointmentId
      ? 'notFound'
      : (current?.state ?? 'loading')

  return {
    receipt,
    state,
    retry: () => setAttempt((value) => value + 1),
  }
}
