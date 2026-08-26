import { beforeEach, describe, expect, it, vi } from 'vitest'
import { seatService } from './seat.service'
import { ConflictError, httpService } from './http.service'
import { useStore } from '../store/store'
import type { Seat, SeatMap } from '../types/seat.types'

/**
 * Service-layer tests for the seat domain.
 *
 * `http.service.ts` is mocked rather than hitting a real API
 * (.rule/testing-rules.md), so these assert the service's own behaviour:
 * routing, payload normalisation, store writes, and the conflict contract.
 */

vi.mock('./http.service', async () => {
  const actual = await vi.importActual<typeof import('./http.service')>('./http.service')
  return {
    ...actual,
    httpService: { ...actual.httpService, get: vi.fn(), post: vi.fn() },
  }
})

const getMock = vi.mocked(httpService.get)
const postMock = vi.mocked(httpService.post)

function buildSeat(overrides: Partial<Seat> = {}): Seat {
  return { id: 's1', busId: 'b1', label: '1', row: 1, column: 1, status: 'available', ...overrides }
}

function buildSeatMap(seats: Seat[] = [buildSeat()]): SeatMap {
  return {
    bus: { id: 'b1', name: 'אוטובוס 1', seatCount: seats.length, pickupPoints: ['תל אביב'] },
    seats,
  }
}

const VALID_REQUEST = {
  seatId: 's1',
  fullName: '  נועה לוי  ',
  phone: '052-447-1903',
  pickupPoint: 'תל אביב',
}

beforeEach(() => {
  vi.clearAllMocks()
  useStore.setState({ selectedBusId: 'b1', seatMap: null })
})

describe('seatService.getSeatMap', () => {
  it('fetches the bus seat map from tour-service without an auth header', async () => {
    getMock.mockResolvedValue(buildSeatMap())

    await seatService.getSeatMap('b1')

    expect(getMock).toHaveBeenCalledWith('/api/buses/b1/seats', {
      service: 'tour-service',
      withAuth: false,
      signal: undefined,
    })
  })

  it('url-encodes the bus id', async () => {
    getMock.mockResolvedValue(buildSeatMap())

    await seatService.getSeatMap('b 1/2')

    expect(getMock).toHaveBeenCalledWith('/api/buses/b%201%2F2/seats', expect.any(Object))
  })

  it('writes the fetched map into the store', async () => {
    const seatMap = buildSeatMap()
    getMock.mockResolvedValue(seatMap)

    await seatService.getSeatMap('b1')

    expect(useStore.getState().seatMap).toEqual(seatMap)
  })

  it('drops a response for a bus the passenger has already switched away from', async () => {
    getMock.mockResolvedValue(buildSeatMap())
    useStore.setState({ selectedBusId: 'b2' })

    await seatService.getSeatMap('b1')

    expect(useStore.getState().seatMap).toBeNull()
  })
})

describe('seatService.requestSeat', () => {
  it('posts the request to the seat-bookings route without an auth header', async () => {
    postMock.mockResolvedValue({ seat: buildSeat({ status: 'pending' }) })

    await seatService.requestSeat(VALID_REQUEST)

    expect(postMock).toHaveBeenCalledWith('/api/seats/bookings', expect.any(Object), {
      service: 'tour-service',
      withAuth: false,
    })
  })

  it('trims the name and normalises the phone number before sending', async () => {
    postMock.mockResolvedValue({ seat: buildSeat({ status: 'pending' }) })

    await seatService.requestSeat(VALID_REQUEST)

    expect(postMock).toHaveBeenCalledWith(
      '/api/seats/bookings',
      { seatId: 's1', fullName: 'נועה לוי', phone: '0524471903', pickupPoint: 'תל אביב' },
      expect.any(Object),
    )
  })

  it('writes back only the seat the server confirmed, never an optimistic status', async () => {
    useStore.getState().setSeatMap(buildSeatMap())
    postMock.mockResolvedValue({ seat: buildSeat({ status: 'pending' }) })

    await seatService.requestSeat(VALID_REQUEST)

    expect(useStore.getState().seatMap?.seats[0].status).toBe('pending')
  })

  it('propagates a 409 conflict and leaves the seat map untouched', async () => {
    useStore.getState().setSeatMap(buildSeatMap())
    postMock.mockRejectedValue(new ConflictError('seat already taken', 'SEAT_NOT_AVAILABLE'))

    await expect(seatService.requestSeat(VALID_REQUEST)).rejects.toBeInstanceOf(ConflictError)
    expect(useStore.getState().seatMap?.seats[0].status).toBe('available')
  })
})
