import { CircleCheck, Clock, Lock, type LucideIcon } from 'lucide-react'

import type { StringKey } from '../i18n/strings'
import type { TimeSlotStatus } from '../types/timeSlot.types'

/**
 * Single lookup for how each TimeSlot status is presented, so the mapping lives
 * in one place instead of being re-derived by every view that renders a slot
 * (.rule/style-rules.md, "Domain-Specific Color Mapping").
 *
 * Colour is never the only signal: each status also carries an icon and a text
 * label, which is what makes the picker usable for a colour-blind Customer and
 * a screen-reader user alike (accessibility-layer).
 */
export const timeSlotStatusStyles: Record<TimeSlotStatus, string> = {
  open: 'border-success/40 bg-white text-neutral-900',
  held: 'border-warning/40 bg-warning/10 text-neutral-900',
  booked: 'border-neutral-900/15 bg-neutral-900/5 text-neutral-900/60',
}

/** Icon per status — reused unchanged in every view (.rule/ui-rules.md). */
export const timeSlotStatusIcons: Record<TimeSlotStatus, LucideIcon> = {
  open: CircleCheck,
  held: Clock,
  booked: Lock,
}

/** The i18n key naming each status in words. */
export const timeSlotStatusLabelKeys: Record<TimeSlotStatus, StringKey> = {
  open: 'timeSlot.status.open',
  held: 'timeSlot.status.held',
  booked: 'timeSlot.status.booked',
}

/** Tint for the status icon, matching the token mapping above. */
export const timeSlotStatusIconStyles: Record<TimeSlotStatus, string> = {
  open: 'text-success',
  held: 'text-warning',
  booked: 'text-neutral-900/50',
}
