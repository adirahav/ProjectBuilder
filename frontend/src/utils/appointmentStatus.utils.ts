import { CheckCircle2, Clock, XCircle, type LucideIcon } from 'lucide-react'

import type { StringKey } from '../i18n/strings'
import type { AppointmentStatus } from '../types/appointment.types'

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
