import type { StateCreator } from 'zustand'

import type { Service } from '../../types/service.types'
import { serviceService } from '../../services/service.service'
import type { RootState } from '../store'

export interface ServiceSlice {
  services: Service[]
  isLoadingServices: boolean
  /** True when the last load attempt failed — drives the error state in the UI. */
  hasServicesError: boolean
  /**
   * Loads the public Service list into the store. Rethrows on failure so the
   * calling page can surface a toast, per .rule/error-handling-rules.md — the
   * page must not re-set any of this state itself.
   */
  loadServices: () => Promise<void>
}

export const createServiceSlice: StateCreator<RootState, [], [], ServiceSlice> = (set) => ({
  services: [],
  isLoadingServices: false,
  hasServicesError: false,

  loadServices: async () => {
    set({ isLoadingServices: true, hasServicesError: false })

    try {
      const services = await serviceService.getList()
      set({ services })
    } catch (err) {
      console.log('[SERVICE] failed to load the service list')
      set({ services: [], hasServicesError: true })
      throw err
    } finally {
      set({ isLoadingServices: false })
    }
  },
})
