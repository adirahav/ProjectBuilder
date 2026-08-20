import { CheckCircle2, Clock, XCircle, type LucideIcon } from 'lucide-react'

import type { StringKey } from '../i18n/strings'
import type { AdminAppointment, AppointmentStatus } from '../types/appointment.types'

/**
 * Every Appointment status, in the order the Admin's filter offers them —
 * the lifecycle order, so the control reads as a progression rather than an
 * alphabetical accident.
 */
export const APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  'pending',
  'confirmed',
  'cancelled',
] as const

/** True for a string the API and the DB both recognize as a status. */
export function isAppointmentStatus(value: unknown): value is AppointmentStatus {
  return (
    value === 'pending' || value === 'confirmed' || value === 'cancelled'
  )
}

/**
 * Which Admin actions a booking is open to (PRD F10-F11).
 *
 * Kept as one lookup beside the status presentation rather than as conditionals
 * in the table, so "what may be done to a `confirmed` booking" is answered in a
 * single place. The server re-decides both — this only governs which controls
 * are worth showing (plan 013, Open Question 2).
 */
export function canConfirmAppointment(status: AppointmentStatus): boolean {
  return status === 'pending'
}

export function canCancelAppointment(status: AppointmentStatus): boolean {
  return status === 'pending' || status === 'confirmed'
}

/**
 * Orders the Admin list by when the appointment actually happens — soonest
 * first — falling back to the booking's own id so the sort is total and a
 * re-render can never reshuffle two same-time rows under the Admin's cursor.
 *
 * A row whose TimeSlot is missing sorts last rather than first: it is the odd
 * case, and burying the day's real schedule under it would be the wrong trade.
 */
export function sortAppointmentsForAdmin(appointments: AdminAppointment[]): AdminAppointment[] {
  return [...appointments].sort((a, b) => {
    const aKey = sortKeyFor(a)
    const bKey = sortKeyFor(b)

    if (aKey !== bKey) return aKey < bKey ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

// Written as an escape rather than pasted literally: an out-of-range sentinel
// character in source is invisible when reading or editing (.rule/coding-rules.md).
const UNDATED_SORT_KEY = '\uFFFF'

function sortKeyFor(appointment: AdminAppointment): string {
  if (!appointment.timeSlot) return UNDATED_SORT_KEY

  return `${appointment.timeSlot.date}T${appointment.timeSlot.startTime}`
}

/**
 * Single lookup for how each Appointment status is presented, mirroring
 * timeSlotStatus.utils.ts so the mapping lives in one place instead of being
 * re-derived by every view that shows a booking (.rule/style-rules.md,
 * "Domain-Specific Color Mapping").
 *
 * As with TimeSlot, colour is never the only signal: each status also carries
 * an icon and a text label (accessibility-layer).
 */
export const appointmentStatusStyles: Record<AppointmentStatus, string> = {
  pending: 'border-warning/40 bg-warning/10 text-neutral-900',
  confirmed: 'border-success/40 bg-primary-light text-neutral-900',
  cancelled: 'border-danger/40 bg-danger/10 text-neutral-900',
}

/** Icon per status — reused unchanged in every view (.rule/ui-rules.md). */
export const appointmentStatusIcons: Record<AppointmentStatus, LucideIcon> = {
  pending: Clock,
  confirmed: CheckCircle2,
  cancelled: XCircle,
}

/** Tint for the status icon, matching the token mapping above. */
export const appointmentStatusIconStyles: Record<AppointmentStatus, string> = {
  pending: 'text-warning',
  confirmed: 'text-success',
  cancelled: 'text-danger',
}

/** The i18n key naming each status in words. */
export const appointmentStatusLabelKeys: Record<AppointmentStatus, StringKey> = {
  pending: 'appointment.status.pending',
  confirmed: 'appointment.status.confirmed',
  cancelled: 'appointment.status.cancelled',
}
