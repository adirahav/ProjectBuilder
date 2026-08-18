import { beforeEach, describe, expect, it, vi } from 'vitest'

import { serviceService } from './service.service'
import { httpService } from './http.service'
import { buildService } from '../test/factories'

vi.mock('./http.service', () => ({
  httpService: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

const mockedGet = vi.mocked(httpService.get)

describe('serviceService.getList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requests the public services endpoint', async () => {
    mockedGet.mockResolvedValue([])

    await serviceService.getList()

    expect(mockedGet).toHaveBeenCalledWith('/api/services')
  })

  it('returns the active services the API sends back', async () => {
    const services = [buildService({ name: 'Full groom' }), buildService({ name: 'Bath' })]
    mockedGet.mockResolvedValue(services)

    const result = await serviceService.getList()

    expect(result).toEqual(services)
  })

  it('returns an empty array when the clinic has no active services', async () => {
    mockedGet.mockResolvedValue([])

    expect(await serviceService.getList()).toEqual([])
  })

  it('never lets a deactivated Service reach the customer-facing list', async () => {
    const active = buildService({ name: 'Full groom', isActive: true })
    const inactive = buildService({ name: 'Retired treatment', isActive: false })
    mockedGet.mockResolvedValue([active, inactive])

    const result = await serviceService.getList()

    expect(result).toEqual([active])
  })

  it('degrades to an empty list when the payload is not an array', async () => {
    mockedGet.mockResolvedValue({ unexpected: true } as unknown as never)

    expect(await serviceService.getList()).toEqual([])
  })

  it('propagates an API failure to the caller rather than swallowing it', async () => {
    mockedGet.mockRejectedValue(new Error('Network Error'))

    await expect(serviceService.getList()).rejects.toThrow('Network Error')
  })
})
