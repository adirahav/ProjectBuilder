import type { StateCreator } from 'zustand'

import { appointmentService, isAppointmentConflictError } from '../../services/appointment.service'
import type {
  Appointment,
  CreateAppointmentOutcome,
  CustomerDetails,
} from '../../types/appointment.types'
import type { RootState } from '../store'

export interface AppointmentSlice {
  /**
   * The Appointment this Customer just created, handed to the Booking
   * Confirmation screen. Cleared when the details form is re-entered so a stale
   * booking can never be presented as a fresh one.
   */
  appointment: Appointment | null
  /** True while the create request is in flight — blocks a double submit. */
  isCreatingAppointment: boolean
  /**
   * True once the hold behind this booking is known to be gone: either the
   * server said so (409) or the countdown ran out in front of the Customer.
   * Drives the "your time lapsed" path back to the picker.
   */
  hasHoldExpired: boolean

  /**
   * Creates the Appointment from the held slot plus the Customer's details.
   * Resolves to an outcome instead of throwing, because a lapsed hold is an
   * expected result of a short-lived hold (PRD F3b), not a failure.
   */
  createAppointment: (details: CustomerDetails) => Promise<CreateAppointmentOutcome>
  /** Marks the hold as gone from the client's own countdown reaching zero. */
  expireHold: () => void
  /** Resets the booking-submission state when the details form is entered. */
  resetAppointmentFlow: () => void
}

export const createAppointmentSlice: StateCreator<RootState, [], [], AppointmentSlice> = (
  set,
  get,
) => ({
  appointment: null,
  isCreatingAppointment: false,
  hasHoldExpired: false,

  createAppointment: async (details) => {
    const { heldSlot, isCreatingAppointment } = get()

    // A second submit while the first is still in flight would risk two
    // Appointments for one slot; the server would reject the loser with a 409,
    // but there is no reason to make it fight that battle.
    if (isCreatingAppointment) return 'error'

    if (!heldSlot) {
      console.log('[APPOINTMENT] cannot book without a held time slot')
      return 'error'
    }

    set({ isCreatingAppointment: true })

    try {
      const appointment = await appointmentService.create(heldSlot.serviceId, heldSlot.id, details)

      // The slot really is booked now, so the copy of it in the store is
      // updated to say so rather than being left claiming to be `held`
      // (.rule/error-handling-rules.md — re-sync after success).
      set({ appointment, heldSlot: { ...heldSlot, status: 'booked' }, hasHoldExpired: false })
      return 'created'
    } catch (err) {
      const isConflict = isAppointmentConflictError(err)
      console.log(
        isConflict
          ? '[APPOINTMENT] the hold had already lapsed when the booking was submitted'
          : '[APPOINTMENT] creating the appointment failed',
      )

      // Only a conflict proves the hold is gone. A network failure says nothing
      // about the slot, so it must not send the Customer back to re-pick a time
      // they may well still hold.
      set({ appointment: null, hasHoldExpired: isConflict })
      return isConflict ? 'conflict' : 'error'
    } finally {
      set({ isCreatingAppointment: false })
    }
  },

  expireHold: () => {
    if (get().hasHoldExpired) return

    console.log('[APPOINTMENT] the hold countdown reached zero on the details form')
    set({ hasHoldExpired: true })
  },

  resetAppointmentFlow: () => {
    set({ appointment: null, hasHoldExpired: false })
  },
})
