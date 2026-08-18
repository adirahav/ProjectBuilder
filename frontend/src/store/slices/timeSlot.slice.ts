import type { StateCreator } from 'zustand'

import { timeSlotService, isSlotConflictError } from '../../services/timeSlot.service'
import { todayKey } from '../../utils/date.utils'
import type { HoldOutcome, TimeSlot } from '../../types/timeSlot.types'
import type { RootState } from '../store'

export interface TimeSlotSlice {
  /** The day being browsed, `YYYY-MM-DD`. Defaults to today (PRD Screen 2). */
  selectedDate: string
  /** Only `open` slots ever live here — see timeSlot.service.getList. */
  timeSlots: TimeSlot[]
  isLoadingTimeSlots: boolean
  /** True when the last load attempt failed — drives the error state in the UI. */
  hasTimeSlotsError: boolean
  /** The slot whose hold request is currently in flight, if any. */
  holdingSlotId: string | null
  /**
   * True after a hold lost the race for a slot. Drives the "no longer
   * available" banner; cleared on dismiss, on a new date, or on the next hold.
   */
  hasHoldConflict: boolean
  /**
   * The slot this Customer successfully holds, handed to the Customer Details
   * screen. A convenience only — the server's hold is the real source of truth,
   * so losing this on a hard refresh costs the Customer a re-pick, nothing more.
   */
  heldSlot: TimeSlot | null

  setSelectedDate: (date: string) => void
  /**
   * Loads the open slots for a Service and day. Rethrows on failure so the page
   * can surface a toast, per .rule/error-handling-rules.md — the page must not
   * re-set any of this state itself.
   */
  loadTimeSlots: (serviceId: string, date: string) => Promise<void>
  /**
   * Attempts the atomic hold. Resolves to an outcome instead of throwing,
   * because losing the race is an expected result of normal concurrent use
   * (PRD AC-2), not a failure. Re-syncs the list after both a conflict and a
   * hard failure so the UI never shows a slot that is already gone.
   */
  holdTimeSlot: (serviceId: string, slot: TimeSlot) => Promise<HoldOutcome>
  dismissHoldConflict: () => void
}

export const createTimeSlotSlice: StateCreator<RootState, [], [], TimeSlotSlice> = (set, get) => ({
  selectedDate: todayKey(),
  timeSlots: [],
  isLoadingTimeSlots: false,
  hasTimeSlotsError: false,
  holdingSlotId: null,
  hasHoldConflict: false,
  heldSlot: null,

  setSelectedDate: (date) => {
    if (get().selectedDate === date) return

    // A stale conflict banner from the previous day would be confusing next to
    // a freshly loaded list, so changing the day clears it.
    set({ selectedDate: date, hasHoldConflict: false })
  },

  loadTimeSlots: async (serviceId, date) => {
    set({ isLoadingTimeSlots: true, hasTimeSlotsError: false })

    try {
      const timeSlots = await timeSlotService.getList(serviceId, date)

      // The Customer may have moved to another day while this was in flight;
      // applying a late response would show the wrong day's slots.
      if (get().selectedDate !== date) return

      set({ timeSlots })
    } catch (err) {
      console.log('[TIMESLOT] failed to load the open time slots')
      set({ timeSlots: [], hasTimeSlotsError: true })
      throw err
    } finally {
      set({ isLoadingTimeSlots: false })
    }
  },

  holdTimeSlot: async (serviceId, slot) => {
    set({ holdingSlotId: slot.id, hasHoldConflict: false })

    try {
      const heldSlot = await timeSlotService.hold(slot.id)
      set({ heldSlot })
      return 'held'
    } catch (err) {
      const isConflict = isSlotConflictError(err)
      console.log(
        isConflict
          ? '[TIMESLOT] hold lost the race — the slot was already taken'
          : '[TIMESLOT] hold request failed',
      )

      set({ heldSlot: null, hasHoldConflict: isConflict })

      // Re-sync either way: on a conflict the slot is genuinely gone, and on an
      // unknown failure we cannot tell whether the hold landed.
      await get()
        .loadTimeSlots(serviceId, get().selectedDate)
        .catch(() => {
          // The refresh failing is already reflected in hasTimeSlotsError; it
          // must not mask the hold outcome the page is waiting on.
        })

      return isConflict ? 'conflict' : 'error'
    } finally {
      set({ holdingSlotId: null })
    }
  },

  dismissHoldConflict: () => {
    set({ hasHoldConflict: false })
  },
})
