import { create } from 'zustand'

import { createAppSlice, type AppSlice } from './slices/app.slice'
import { createAppointmentSlice, type AppointmentSlice } from './slices/appointment.slice'
import { createAuthSlice, type AuthSlice } from './slices/auth.slice'
import { createServiceSlice, type ServiceSlice } from './slices/service.slice'
import { createTimeSlotSlice, type TimeSlotSlice } from './slices/timeSlot.slice'
import { createUiSlice, type UiSlice } from './slices/ui.slice'

// One combined store, assembled from feature slices. Add one member to
// RootState and one spread below per new slice.
export type RootState = AppSlice &
  ServiceSlice &
  TimeSlotSlice &
  AppointmentSlice &
  AuthSlice &
  UiSlice

export const useStore = create<RootState>((...a) => ({
  ...createAppSlice(...a),
  ...createServiceSlice(...a),
  ...createTimeSlotSlice(...a),
  ...createAppointmentSlice(...a),
  ...createAuthSlice(...a),
  ...createUiSlice(...a),
}))
