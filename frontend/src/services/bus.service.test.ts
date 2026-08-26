import { beforeEach, describe, expect, it, vi } from 'vitest'
import { busService } from './bus.service'
import { NetworkError, httpService } from './http.service'
import { useStore } from '../store/store'
import type { Bus } from '../types/bus.types'

/** Service-layer tests for the bus domain, with `http.service.ts` mocked. */

vi.mock('./http.service', async () => {
  const actual = await vi.importActual<typeof import('./http.service')>('./http.service')
  return { ...actual, httpService: { ...actual.httpService, get: vi.fn() } }
})

const getMock = vi.mocked(httpService.get)

const BUS: Bus = {
  id: 'b1',
  tourId: 't1',
  name: 'אוטובוס 1',
  seatCount: 45,
  pickupPoints: ['תל אביב', 'חיפה'],
}

beforeEach(() => {
  vi.clearAllMocks()
  useStore.setState({ buses: [] })
})

describe('busService.getBusesByTour', () => {
  it('fetches the buses nested under their tour', async () => {
    getMock.mockResolvedValue({ buses: [BUS] })

    await busService.getBusesByTour('t1')

    expect(getMock).toHaveBeenCalledWith('/api/tours/t1/buses', {
      service: 'tour-service',
      withAuth: false,
      signal: undefined,
    })
  })

  it('url-encodes the tour id', async () => {
    getMock.mockResolvedValue({ buses: [] })

    await busService.getBusesByTour('t 1/2')

    expect(getMock).toHaveBeenCalledWith('/api/tours/t%201%2F2/buses', expect.any(Object))
  })

  it('writes the fetched buses, including their pickup points, into the store', async () => {
    getMock.mockResolvedValue({ buses: [BUS] })

    await busService.getBusesByTour('t1')

    expect(useStore.getState().buses).toEqual([BUS])
    expect(useStore.getState().buses[0].pickupPoints).toEqual(['תל אביב', 'חיפה'])
  })

  it('propagates a network failure to the caller', async () => {
    getMock.mockRejectedValue(new NetworkError('offline'))

    await expect(busService.getBusesByTour('t1')).rejects.toBeInstanceOf(NetworkError)
    expect(useStore.getState().buses).toEqual([])
  })
})
