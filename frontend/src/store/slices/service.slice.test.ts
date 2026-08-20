import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useStore } from '../store'
import { serviceService } from '../../services/service.service'
import { buildService } from '../../test/factories'

vi.mock('../../services/service.service', () => ({
  serviceService: {
    getList: vi.fn(),
    getAllList: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
  },
}))

const mockedGetList = vi.mocked(serviceService.getList)
const mockedGetAllList = vi.mocked(serviceService.getAllList)
const mockedCreate = vi.mocked(serviceService.create)
const mockedUpdate = vi.mocked(serviceService.update)
const mockedDeactivate = vi.mocked(serviceService.deactivate)

describe('serviceSlice.loadServices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('puts the fetched services in the store', async () => {
    const services = [buildService({ name: 'Full groom' })]
    mockedGetList.mockResolvedValue(services)

    await useStore.getState().loadServices()

    expect(useStore.getState().services).toEqual(services)
  })

  it('flags loading while the request is in flight and clears it after', async () => {
    let resolveList: (services: never[]) => void = () => {}
    mockedGetList.mockReturnValue(
      new Promise((resolve) => {
        resolveList = resolve as (services: never[]) => void
      }),
    )

    const pending = useStore.getState().loadServices()
    expect(useStore.getState().isLoadingServices).toBe(true)

    resolveList([])
    await pending

    expect(useStore.getState().isLoadingServices).toBe(false)
  })

  it('records an error state and rethrows so the page can warn the customer', async () => {
    mockedGetList.mockRejectedValue(new Error('Network Error'))

    await expect(useStore.getState().loadServices()).rejects.toThrow('Network Error')

    expect(useStore.getState().hasServicesError).toBe(true)
    expect(useStore.getState().isLoadingServices).toBe(false)
    expect(useStore.getState().services).toEqual([])
  })

  it('drops a stale list on failure so no outdated service stays bookable', async () => {
    mockedGetList.mockResolvedValueOnce([buildService()])
    await useStore.getState().loadServices()
    expect(useStore.getState().services).toHaveLength(1)

    mockedGetList.mockRejectedValueOnce(new Error('Network Error'))
    await expect(useStore.getState().loadServices()).rejects.toThrow()

    expect(useStore.getState().services).toEqual([])
  })

  it('clears a previous error when a retry succeeds', async () => {
    mockedGetList.mockRejectedValueOnce(new Error('Network Error'))
    await expect(useStore.getState().loadServices()).rejects.toThrow()

    mockedGetList.mockResolvedValueOnce([buildService()])
    await useStore.getState().loadServices()

    expect(useStore.getState().hasServicesError).toBe(false)
  })

  it('renders an empty list rather than an error when the clinic has no services', async () => {
    mockedGetList.mockResolvedValue([])

    await useStore.getState().loadServices()

    expect(useStore.getState().services).toEqual([])
    expect(useStore.getState().hasServicesError).toBe(false)
  })
})

describe('serviceSlice.loadAdminServices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStore.setState({ adminServices: [], services: [] })
  })

  it('keeps the Admin list separate from the customer-facing one', async () => {
    const inactive = buildService({ name: 'Retired trim', isActive: false })
    mockedGetAllList.mockResolvedValue([inactive])

    await useStore.getState().loadAdminServices()

    expect(useStore.getState().adminServices).toEqual([inactive])
    // The public list must never inherit a deactivated record.
    expect(useStore.getState().services).toEqual([])
  })

  it('lands already sorted, offered treatments first', async () => {
    mockedGetAllList.mockResolvedValue([
      buildService({ name: 'Aardvark trim', isActive: false }),
      buildService({ name: 'Zebra wash', isActive: true }),
    ])

    await useStore.getState().loadAdminServices()

    expect(useStore.getState().adminServices.map((service) => service.name)).toEqual([
      'Zebra wash',
      'Aardvark trim',
    ])
  })

  it('flags loading while the request is in flight and clears it after', async () => {
    let resolveList: (services: never[]) => void = () => {}
    mockedGetAllList.mockReturnValue(
      new Promise((resolve) => {
        resolveList = resolve as (services: never[]) => void
      }),
    )

    const pending = useStore.getState().loadAdminServices()
    expect(useStore.getState().isLoadingAdminServices).toBe(true)

    resolveList([])
    await pending

    expect(useStore.getState().isLoadingAdminServices).toBe(false)
  })

  it('records an error state and rethrows so the page can warn the Admin', async () => {
    mockedGetAllList.mockRejectedValue(new Error('Network Error'))

    await expect(useStore.getState().loadAdminServices()).rejects.toThrow('Network Error')

    expect(useStore.getState().hasAdminServicesError).toBe(true)
    expect(useStore.getState().isLoadingAdminServices).toBe(false)
    expect(useStore.getState().adminServices).toEqual([])
  })

  it('clears a previous error when a retry succeeds', async () => {
    mockedGetAllList.mockRejectedValueOnce(new Error('Network Error'))
    await expect(useStore.getState().loadAdminServices()).rejects.toThrow()

    mockedGetAllList.mockResolvedValueOnce([buildService()])
    await useStore.getState().loadAdminServices()

    expect(useStore.getState().hasAdminServicesError).toBe(false)
  })
})

describe('serviceSlice.createService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStore.setState({ adminServices: [] })
  })

  it('stores the record the server returned, never the draft that was sent', async () => {
    const created = buildService({ id: 'server-id', name: 'Bath', isActive: true })
    mockedCreate.mockResolvedValue(created)

    await useStore.getState().createService({ name: 'Bath', durationMinutes: 45, price: 120 })

    expect(useStore.getState().adminServices).toEqual([created])
  })

  it('inserts the new record in the list order rather than at the end', async () => {
    useStore.setState({ adminServices: [buildService({ name: 'Zebra wash', isActive: true })] })
    mockedCreate.mockResolvedValue(buildService({ name: 'Adult groom', isActive: true }))

    await useStore
      .getState()
      .createService({ name: 'Adult groom', durationMinutes: 45, price: 120 })

    expect(useStore.getState().adminServices.map((service) => service.name)).toEqual([
      'Adult groom',
      'Zebra wash',
    ])
  })

  it('flags the save while it is in flight and clears it after', async () => {
    let resolveCreate: (service: never) => void = () => {}
    mockedCreate.mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve as (service: never) => void
      }),
    )

    const pending = useStore
      .getState()
      .createService({ name: 'Bath', durationMinutes: 45, price: 120 })
    expect(useStore.getState().isSavingService).toBe(true)

    resolveCreate(buildService() as never)
    await pending

    expect(useStore.getState().isSavingService).toBe(false)
  })

  it('leaves the list untouched and rethrows when the write fails', async () => {
    const existing = buildService()
    useStore.setState({ adminServices: [existing] })
    mockedCreate.mockRejectedValue(new Error('Network Error'))

    await expect(
      useStore.getState().createService({ name: 'Bath', durationMinutes: 45, price: 120 }),
    ).rejects.toThrow('Network Error')

    expect(useStore.getState().adminServices).toEqual([existing])
    expect(useStore.getState().isSavingService).toBe(false)
  })
})

describe('serviceSlice.updateService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStore.setState({ adminServices: [] })
  })

  it('swaps in the updated record in place', async () => {
    const original = buildService({ name: 'Full groom', price: 220 })
    useStore.setState({ adminServices: [original] })

    const updated = { ...original, price: 250 }
    mockedUpdate.mockResolvedValue(updated)

    await useStore.getState().updateService(original.id, { price: 250 })

    expect(useStore.getState().adminServices).toEqual([updated])
  })

  it('re-sorts when an edit brings a retired treatment back', async () => {
    const retired = buildService({ name: 'Zebra wash', isActive: false })
    const offered = buildService({ name: 'Adult groom', isActive: true })
    useStore.setState({ adminServices: [offered, retired] })

    mockedUpdate.mockResolvedValue({ ...retired, isActive: true })

    await useStore.getState().updateService(retired.id, { isActive: true })

    expect(useStore.getState().adminServices.map((service) => service.isActive)).toEqual([
      true,
      true,
    ])
  })

  it('adopts a record it did not know about rather than dropping the response', async () => {
    const unknown = buildService({ name: 'Surprise' })
    mockedUpdate.mockResolvedValue(unknown)

    await useStore.getState().updateService(unknown.id, { price: 5 })

    expect(useStore.getState().adminServices).toEqual([unknown])
  })

  it('rethrows and clears the saving flag when the write fails', async () => {
    mockedUpdate.mockRejectedValue(new Error('Network Error'))

    await expect(useStore.getState().updateService('service-1', { price: 5 })).rejects.toThrow()

    expect(useStore.getState().isSavingService).toBe(false)
  })
})

describe('serviceSlice.deactivateService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStore.setState({ adminServices: [], services: [] })
  })

  it('keeps the record in the Admin list, now marked as not offered', async () => {
    const service = buildService({ isActive: true })
    useStore.setState({ adminServices: [service] })
    mockedDeactivate.mockResolvedValue({ ...service, isActive: false })

    await useStore.getState().deactivateService(service.id)

    expect(useStore.getState().adminServices).toHaveLength(1)
    expect(useStore.getState().adminServices[0].isActive).toBe(false)
  })

  it('drops it from the customer-facing list so the two views cannot disagree', async () => {
    const service = buildService({ isActive: true })
    useStore.setState({ adminServices: [service], services: [service] })
    mockedDeactivate.mockResolvedValue({ ...service, isActive: false })

    await useStore.getState().deactivateService(service.id)

    expect(useStore.getState().services).toEqual([])
  })

  it('leaves the other bookable services alone', async () => {
    const target = buildService({ isActive: true })
    const other = buildService({ isActive: true })
    useStore.setState({ adminServices: [target, other], services: [target, other] })
    mockedDeactivate.mockResolvedValue({ ...target, isActive: false })

    await useStore.getState().deactivateService(target.id)

    expect(useStore.getState().services).toEqual([other])
  })

  it('rethrows and changes nothing when the write fails', async () => {
    const service = buildService({ isActive: true })
    useStore.setState({ adminServices: [service], services: [service] })
    mockedDeactivate.mockRejectedValue(new Error('Network Error'))

    await expect(useStore.getState().deactivateService(service.id)).rejects.toThrow()

    expect(useStore.getState().adminServices[0].isActive).toBe(true)
    expect(useStore.getState().services).toEqual([service])
    expect(useStore.getState().isSavingService).toBe(false)
  })
})
