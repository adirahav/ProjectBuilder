import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useStore } from '../store'
import { serviceService } from '../../services/service.service'
import { buildService } from '../../test/factories'

vi.mock('../../services/service.service', () => ({
  serviceService: { getList: vi.fn() },
}))

const mockedGetList = vi.mocked(serviceService.getList)

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
