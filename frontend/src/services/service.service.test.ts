import { AxiosError, AxiosHeaders } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { isMissingServiceError, serviceService } from './service.service'
import { gatewayHttpService, httpService } from './http.service'
import { buildService } from '../test/factories'

vi.mock('./http.service', () => ({
  httpService: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  gatewayHttpService: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

const mockedGet = vi.mocked(httpService.get)
const mockedGatewayGet = vi.mocked(gatewayHttpService.get)
const mockedGatewayPost = vi.mocked(gatewayHttpService.post)
const mockedGatewayPatch = vi.mocked(gatewayHttpService.patch)

function buildErrorWithStatus(status: number): AxiosError {
  const error = new AxiosError(`Request failed with status code ${status}`)
  error.response = {
    status,
    statusText: 'Error',
    data: { error: 'Service not found' },
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  }
  return error
}

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

describe('serviceService.getAllList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('asks api-gateway, not booking-service, so the JWT is verified', async () => {
    mockedGatewayGet.mockResolvedValue([])

    await serviceService.getAllList()

    expect(mockedGatewayGet).toHaveBeenCalledWith('/api/services/all')
    expect(mockedGet).not.toHaveBeenCalled()
  })

  it('keeps the deactivated services — showing them is the point of this list', async () => {
    const active = buildService({ isActive: true })
    const inactive = buildService({ isActive: false })
    mockedGatewayGet.mockResolvedValue([active, inactive])

    expect(await serviceService.getAllList()).toEqual([active, inactive])
  })

  it('degrades to an empty list when the payload is not an array', async () => {
    mockedGatewayGet.mockResolvedValue({ unexpected: true } as unknown as never)

    expect(await serviceService.getAllList()).toEqual([])
  })

  it('propagates a rejected request rather than pretending the clinic has no services', async () => {
    mockedGatewayGet.mockRejectedValue(buildErrorWithStatus(401))

    await expect(serviceService.getAllList()).rejects.toBeInstanceOf(AxiosError)
  })
})

describe('serviceService.create', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('posts the draft through api-gateway', async () => {
    const created = buildService()
    mockedGatewayPost.mockResolvedValue(created)

    const draft = { name: 'Bath', durationMinutes: 45, price: 120 }
    const result = await serviceService.create(draft)

    expect(mockedGatewayPost).toHaveBeenCalledWith('/api/services', draft)
    expect(result).toEqual(created)
  })

  it('refuses to send a draft that cannot possibly be accepted', async () => {
    await expect(
      serviceService.create({ name: '', durationMinutes: 45, price: 120 }),
    ).rejects.toThrow('Invalid service')

    expect(mockedGatewayPost).not.toHaveBeenCalled()
  })

  it('refuses a nonsensical duration before the request leaves', async () => {
    await expect(
      serviceService.create({ name: 'Bath', durationMinutes: 0, price: 120 }),
    ).rejects.toThrow('Invalid service')

    expect(mockedGatewayPost).not.toHaveBeenCalled()
  })
})

describe('serviceService.update', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('patches only the fields it was given', async () => {
    const updated = buildService({ price: 250 })
    mockedGatewayPatch.mockResolvedValue(updated)

    const result = await serviceService.update('service-1', { price: 250 })

    expect(mockedGatewayPatch).toHaveBeenCalledWith('/api/services/service-1', { price: 250 })
    expect(result).toEqual(updated)
  })

  it('accepts isActive: true, the only route back from a deactivation', async () => {
    mockedGatewayPatch.mockResolvedValue(buildService({ isActive: true }))

    await serviceService.update('service-1', { isActive: true })

    expect(mockedGatewayPatch).toHaveBeenCalledWith('/api/services/service-1', { isActive: true })
  })

  it('refuses an empty patch instead of firing a request that changes nothing', async () => {
    await expect(serviceService.update('service-1', {})).rejects.toThrow('Empty service patch')

    expect(mockedGatewayPatch).not.toHaveBeenCalled()
  })

  it('refuses to write without an id, which would hit the collection route', async () => {
    await expect(serviceService.update('', { price: 1 })).rejects.toThrow('Missing service id')

    expect(mockedGatewayPatch).not.toHaveBeenCalled()
  })

  it('refuses a patch whose one field is invalid', async () => {
    await expect(serviceService.update('service-1', { price: -5 })).rejects.toThrow(
      'Invalid service patch',
    )

    expect(mockedGatewayPatch).not.toHaveBeenCalled()
  })

  it('does not judge the fields a patch leaves out', async () => {
    mockedGatewayPatch.mockResolvedValue(buildService())

    // No name is being sent, so the "name is required" rule must not fire.
    await expect(serviceService.update('service-1', { price: 10 })).resolves.toBeDefined()
  })
})

describe('serviceService.deactivate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the dedicated endpoint so the intent is explicit server-side', async () => {
    const deactivated = buildService({ isActive: false })
    mockedGatewayPatch.mockResolvedValue(deactivated)

    const result = await serviceService.deactivate('service-1')

    expect(mockedGatewayPatch).toHaveBeenCalledWith('/api/services/service-1/deactivate')
    expect(result).toEqual(deactivated)
  })

  it('refuses to deactivate without an id', async () => {
    await expect(serviceService.deactivate('')).rejects.toThrow('Missing service id')

    expect(mockedGatewayPatch).not.toHaveBeenCalled()
  })

  it('propagates a 404 so the page can say the record is gone', async () => {
    mockedGatewayPatch.mockRejectedValue(buildErrorWithStatus(404))

    await expect(serviceService.deactivate('service-1')).rejects.toBeInstanceOf(AxiosError)
  })
})

describe('isMissingServiceError', () => {
  it('recognises the 404 that means the record was removed meanwhile', () => {
    expect(isMissingServiceError(buildErrorWithStatus(404))).toBe(true)
  })

  it('does not mistake a server fault for a missing record', () => {
    expect(isMissingServiceError(buildErrorWithStatus(500))).toBe(false)
  })

  it('does not mistake an offline browser for a missing record', () => {
    expect(isMissingServiceError(new Error('Network Error'))).toBe(false)
  })
})
