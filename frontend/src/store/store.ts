import { create } from 'zustand'

import { createAppSlice, type AppSlice } from './slices/app.slice'
import { createAppointmentSlice, type AppointmentSlice } from './slices/appointment.slice'
import { createServiceSlice, type ServiceSlice } from './slices/service.slice'
import { createTimeSlotSlice, type TimeSlotSlice } from './slices/timeSlot.slice'

// One combined store, assembled from feature slices. Add one member to
// RootState and one spread below per new slice (auth).
export type RootState = AppSlice & ServiceSlice & TimeSlotSlice & AppointmentSlice

export const useStore = create<RootState>((...a) => ({
  ...createAppSlice(...a),
  ...createServiceSlice(...a),
  ...createTimeSlotSlice(...a),
  ...createAppointmentSlice(...a),
}))
