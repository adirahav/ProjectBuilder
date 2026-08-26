import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'
import type { Seat, SeatMap } from '../../types/seat.types'
import type { Tour } from '../../types/tour.types'
import type { Bus } from '../../types/bus.types'

/**
 * State-transition tests for the passenger-view slices.
 *
 * The selection cascade matters as much as the seat writes: a bus list or seat
 * map left over from a previous selection is a correctness bug, not a cosmetic
 * one — it would show a passenger a map for a bus they are not looking at.
 */

const TOUR: Tour = { id: 't1', name: 'הגליל העליון', startDate: '2026-04-12' }

const BUS: Bus = {
  id: 'b1',
  tourId: 't1',
  name: 'אוטובוס 1',
  seatCount: 2,
  pickupPoints: ['תל אביב'],
}

function buildSeat(overrides: Partial<Seat> = {}): Seat {
  return { id: 's1', busId: 'b1', label: '1', row: 1, column: 1, status: 'available', ...overrides }
}

function buildSeatMap(seats: Seat[] = [buildSeat()]): SeatMap {
  return {
    bus: { id: 'b1', name: 'אוטובוס 1', seatCount: seats.length, pickupPoints: ['תל אביב'] },
    seats,
  }
}

beforeEach(() => {
  useStore.setState({
    tours: [],
    buses: [],
    selectedTourId: null,
    selectedBusId: null,
    seatMap: null,
  })
})

describe('tourSlice', () => {
  it('stores the tours the service fetched', () => {
    useStore.getState().setTours([TOUR])

    expect(useStore.getState().tours).toEqual([TOUR])
  })

  it('clears the bus list, bus selection and seat map when the tour changes', () => {
    useStore.setState({ buses: [BUS], selectedBusId: 'b1', seatMap: buildSeatMap() })

    useStore.getState().selectTour('t2')

    expect(useStore.getState().selectedTourId).toBe('t2')
    expect(useStore.getState().buses).toEqual([])
    expect(useStore.getState().selectedBusId).toBeNull()
    expect(useStore.getState().seatMap).toBeNull()
  })
})

describe('busSlice', () => {
  it('clears the seat map when the bus changes', () => {
    useStore.setState({ buses: [BUS], seatMap: buildSeatMap() })

    useStore.getState().selectBus('b2')

    expect(useStore.getState().selectedBusId).toBe('b2')
    expect(useStore.getState().seatMap).toBeNull()
  })
})

describe('seatSlice', () => {
  it('replaces a single seat with the version the server confirmed', () => {
    useStore
      .getState()
      .setSeatMap(buildSeatMap([buildSeat(), buildSeat({ id: 's2', label: '2', column: 2 })]))

    useStore.getState().applySeat(buildSeat({ status: 'pending' }))

    const seats = useStore.getState().seatMap?.seats ?? []
    expect(seats.find((seat) => seat.id === 's1')?.status).toBe('pending')
    expect(seats.find((seat) => seat.id === 's2')?.status).toBe('available')
  })

  it('ignores a seat belonging to a bus that is no longer displayed', () => {
    useStore.getState().setSeatMap(buildSeatMap())

    useStore.getState().applySeat(buildSeat({ busId: 'b-other', status: 'taken' }))

    expect(useStore.getState().seatMap?.seats[0].status).toBe('available')
  })

  it('ignores a confirmed seat when no map is loaded', () => {
    useStore.getState().applySeat(buildSeat({ status: 'pending' }))

    expect(useStore.getState().seatMap).toBeNull()
  })
})
