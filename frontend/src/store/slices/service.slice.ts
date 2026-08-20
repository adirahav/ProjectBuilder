import type { StateCreator } from 'zustand'

import type { Service, ServiceDraft, ServicePatch } from '../../types/service.types'
import { serviceService } from '../../services/service.service'
import { sortServicesForAdmin } from '../../utils/service.utils'
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

  /**
   * The Admin view of the same entity: every Service, deactivated ones
   * included. Kept separate from `services` rather than reusing it, because the
   * two lists mean different things — one is "what a Customer may book", the
   * other "what the clinic has on record". Merging them would put a
   * soft-deleted Service one stale render away from the public screen.
   */
  adminServices: Service[]
  isLoadingAdminServices: boolean
  hasAdminServicesError: boolean
  /** True while a create/edit/deactivate write is in flight — blocks a double submit. */
  isSavingService: boolean

  loadAdminServices: () => Promise<void>
  createService: (draft: ServiceDraft) => Promise<Service>
  updateService: (id: string, patch: ServicePatch) => Promise<Service>
  deactivateService: (id: string) => Promise<Service>
}

export const createServiceSlice: StateCreator<RootState, [], [], ServiceSlice> = (set, get) => ({
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

  adminServices: [],
  isLoadingAdminServices: false,
  hasAdminServicesError: false,
  isSavingService: false,

  loadAdminServices: async () => {
    set({ isLoadingAdminServices: true, hasAdminServicesError: false })

    try {
      const services = await serviceService.getAllList()
      set({ adminServices: sortServicesForAdmin(services) })
    } catch (err) {
      console.log('[SERVICE] failed to load the admin service list')
      set({ adminServices: [], hasAdminServicesError: true })
      throw err
    } finally {
      set({ isLoadingAdminServices: false })
    }
  },

  createService: async (draft) => {
    set({ isSavingService: true })

    try {
      const created = await serviceService.create(draft)
      // The server's record is what lands in the store — never the draft that
      // was sent. Only the response proves the write happened, and only it
      // carries the id and the server-assigned `isActive`.
      set({ adminServices: sortServicesForAdmin([...get().adminServices, created]) })
      return created
    } catch (err) {
      console.log('[SERVICE] failed to create a service')
      throw err
    } finally {
      set({ isSavingService: false })
    }
  },

  updateService: async (id, patch) => {
    set({ isSavingService: true })

    try {
      const updated = await serviceService.update(id, patch)
      set({ adminServices: replaceService(get().adminServices, updated) })
      return updated
    } catch (err) {
      console.log('[SERVICE] failed to update a service')
      throw err
    } finally {
      set({ isSavingService: false })
    }
  },

  deactivateService: async (id) => {
    set({ isSavingService: true })

    try {
      const deactivated = await serviceService.deactivate(id)
      set({ adminServices: replaceService(get().adminServices, deactivated) })

      // The public list, if this session ever loaded one, now contains a
      // Service no Customer may book. Drop it rather than leave the two views
      // disagreeing (.rule/error-handling-rules.md: never show stale state
      // after a mutation).
      const publicServices = get().services
      if (publicServices.some((service) => service.id === deactivated.id)) {
        set({ services: publicServices.filter((service) => service.id !== deactivated.id) })
      }

      return deactivated
    } catch (err) {
      console.log('[SERVICE] failed to deactivate a service')
      throw err
    } finally {
      set({ isSavingService: false })
    }
  },
})

/** Swaps one record for its updated version, keeping the Admin ordering. A
 * server response for an id we do not hold is appended rather than dropped, so
 * a list that drifted still converges on what the server says. */
function replaceService(services: Service[], updated: Service): Service[] {
  const isKnown = services.some((service) => service.id === updated.id)

  const next = isKnown
    ? services.map((service) => (service.id === updated.id ? updated : service))
    : [...services, updated]

  return sortServicesForAdmin(next)
}
