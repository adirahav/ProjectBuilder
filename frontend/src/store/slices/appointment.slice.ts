import type { StateCreator } from 'zustand'

import {
  appointmentService,
  isAppointmentConflictError,
  isAppointmentNotFoundError,
} from '../../services/appointment.service'
import { sortAppointmentsForAdmin } from '../../utils/appointmentStatus.utils'
import type {
  AdminAppointment,
  Appointment,
  AppointmentActionOutcome,
  AppointmentFilter,
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

  /**
   * The Admin's view of the same entity (PRD F9-F11, Screen 7): every booking
   * in the clinic, not just this browser's own. Kept separate from
   * `appointment` above for the same reason the Service slice keeps two lists —
   * one is "the booking this Customer just made", the other "what the clinic
   * has on record", and merging them would put another customer's phone number
   * one stale render away from a public screen.
   */
  adminAppointments: AdminAppointment[]
  isLoadingAdminAppointments: boolean
  hasAdminAppointmentsError: boolean
  /** The filter the list was last loaded with — the page reads it back to re-fetch. */
  appointmentFilter: AppointmentFilter
  /** True while a confirm/cancel is in flight — blocks a double submit. */
  isSavingAppointment: boolean

  /**
   * Loads the Admin list for the given filter. Rethrows on failure so the page
   * can surface a toast; the page must not re-set any of this state itself
   * (.rule/error-handling-rules.md).
   */
  loadAdminAppointments: (filter?: AppointmentFilter) => Promise<void>
  /**
   * Confirms a pending booking (F10). Resolves to an outcome rather than
   * throwing: a `conflict` or a `not-found` means the list was simply out of
   * date, which is a normal result of acting on a fetched list, not a fault.
   */
  confirmAppointment: (id: string) => Promise<AppointmentActionOutcome>
  /** Cancels a pending or confirmed booking (F11), releasing its TimeSlot. */
  cancelAppointment: (id: string) => Promise<AppointmentActionOutcome>
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

  adminAppointments: [],
  isLoadingAdminAppointments: false,
  hasAdminAppointmentsError: false,
  appointmentFilter: {},
  isSavingAppointment: false,

  loadAdminAppointments: async (filter) => {
    // An omitted argument means "reload with whatever is on screen", which is
    // what every post-write refresh wants; passing `{}` explicitly is how the
    // page clears the filter.
    const nextFilter = filter ?? get().appointmentFilter

    set({
      isLoadingAdminAppointments: true,
      hasAdminAppointmentsError: false,
      appointmentFilter: nextFilter,
    })

    try {
      const appointments = await appointmentService.getAdminList(nextFilter)
      set({ adminAppointments: sortAppointmentsForAdmin(appointments) })
    } catch (err) {
      console.log('[APPOINTMENT] failed to load the admin appointment list')
      set({ adminAppointments: [], hasAdminAppointmentsError: true })
      throw err
    } finally {
      set({ isLoadingAdminAppointments: false })
    }
  },

  confirmAppointment: async (id) => {
    return runAdminAction(set, get, id, () => appointmentService.confirm(id), 'confirm')
  },

  cancelAppointment: async (id) => {
    return runAdminAction(set, get, id, () => appointmentService.cancel(id), 'cancel')
  },
})

// Confirm and cancel differ only in which request they send and what they log:
// both are a single conditional transition whose outcome is decided entirely by
// the response, so the handling of that response lives once rather than twice.
type SetState = Parameters<StateCreator<RootState, [], [], AppointmentSlice>>[0]
type GetState = Parameters<StateCreator<RootState, [], [], AppointmentSlice>>[1]

async function runAdminAction(
  set: SetState,
  get: GetState,
  id: string,
  request: () => Promise<AdminAppointment>,
  action: 'confirm' | 'cancel',
): Promise<AppointmentActionOutcome> {
  if (!id) {
    console.log(`[APPOINTMENT] cannot ${action} without an appointment id`)
    return 'error'
  }

  // A second press while the first is still in flight would race the server for
  // the same transition; the loser gets a 409, but there is no reason to make
  // it fight that battle (seat-concurrency-layer).
  if (get().isSavingAppointment) return 'error'

  set({ isSavingAppointment: true })

  try {
    const updated = await request()

    // The server's record is what lands in the row — never a locally-guessed
    // status. Only the response proves the transition happened.
    set({ adminAppointments: replaceAppointment(get().adminAppointments, updated) })
    return 'updated'
  } catch (err) {
    if (isAppointmentConflictError(err)) {
      console.log(`[APPOINTMENT] the booking had already moved on before the ${action} landed`)
      return 'conflict'
    }

    if (isAppointmentNotFoundError(err)) {
      console.log(`[APPOINTMENT] the booking no longer exists, so it cannot be ${action}led`)
      return 'not-found'
    }

    console.log(`[APPOINTMENT] failed to ${action} the appointment`)
    return 'error'
  } finally {
    set({ isSavingAppointment: false })
  }
}

/**
 * Swaps one row for the server's updated version, keeping the list's ordering.
 * A response for an id the list does not hold is appended rather than dropped,
 * so a list that drifted still converges on what the server says.
 *
 * Merged rather than substituted wholesale, for one reason: the PATCH responses
 * return the Appointment, and are not obliged to re-send the joined Service and
 * TimeSlot display fields the list view was rendered from. Every field the
 * server did send wins; the ones it stayed silent about keep the value the list
 * already had, so confirming a row cannot blank out its own service name.
 */
function replaceAppointment(
  appointments: AdminAppointment[],
  updated: AdminAppointment,
): AdminAppointment[] {
  const isKnown = appointments.some((appointment) => appointment.id === updated.id)

  const next = isKnown
    ? appointments.map((appointment) =>
        appointment.id === updated.id ? { ...appointment, ...updated } : appointment,
      )
    : [...appointments, updated]

  return sortAppointmentsForAdmin(next)
}
