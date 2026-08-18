import { create } from 'zustand'

import { createAppSlice, type AppSlice } from './slices/app.slice'
import { createServiceSlice, type ServiceSlice } from './slices/service.slice'

// One combined store, assembled from feature slices. Add one member to
// RootState and one spread below per new slice (auth, timeSlot, appointment).
export type RootState = AppSlice & ServiceSlice

export const useStore = create<RootState>((...a) => ({
  ...createAppSlice(...a),
  ...createServiceSlice(...a),
}))
