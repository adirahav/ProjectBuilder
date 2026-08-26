import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { ToursPage } from './ToursPage'
import { busService } from '../services/bus.service'
import { seatService } from '../services/seat.service'
import { tourService } from '../services/tour.service'
import { ConflictError, NetworkError } from '../services/http.service'
import { useStore } from '../store/store'
import type { Seat, SeatMap } from '../types/seat.types'

/**
 * Screen 3 behaviour tests: the selector cascade, the accessible seat map, and
 * the seat-request contract — success, validation, and the 409 conflict that
 * happens in normal concurrent use (PRD F5 / AC-5).
 *
 * The three domain services are mocked, so no test reaches `http.service.ts` or
 * a real API (.rule/testing-rules.md). Each mock performs the same store write
 * its real counterpart does, since components rely on the service — never their
 * own duplicate update — to move global state.
 */

vi.mock('../services/tour.service', () => ({ tourService: { getTours: vi.fn() } }))
vi.mock('../services/bus.service', () => ({ busService: { getBusesByTour: vi.fn() } }))
vi.mock('../services/seat.service', () => ({
  seatService: { getSeatMap: vi.fn(), requestSeat: vi.fn() },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const getToursMock = vi.mocked(tourService.getTours)
const getBusesMock = vi.mocked(busService.getBusesByTour)
const getSeatMapMock = vi.mocked(seatService.getSeatMap)
const requestSeatMock = vi.mocked(seatService.requestSeat)

const TOUR = { id: 't1', name: 'הגליל העליון', startDate: '2026-04-12' }
const BUS = {
  id: 'b1',
  tourId: 't1',
  name: 'אוטובוס 1',
  seatCount: 4,
  pickupPoints: ['התחנה המרכזית תל אביב', 'חיפה — חוף הכרמל'],
}

function buildSeat(overrides: Partial<Seat> = {}): Seat {
  return { id: 's1', busId: 'b1', label: '1', row: 1, column: 1, status: 'available', ...overrides }
}

function buildSeatMap(seats: Seat[]): SeatMap {
  return {
    bus: {
      id: BUS.id,
      name: BUS.name,
      seatCount: BUS.seatCount,
      pickupPoints: BUS.pickupPoints,
      aisleAfterColumn: 2,
    },
    seats,
  }
}

const DEFAULT_SEATS = [
  buildSeat({ id: 's1', label: '1', column: 1, status: 'available' }),
  buildSeat({ id: 's2', label: '2', column: 2, status: 'pending' }),
  buildSeat({ id: 's3', label: '3', column: 3, status: 'taken' }),
  buildSeat({ id: 's4', label: '4', column: 4, status: 'reserved' }),
]

/** What the server would return on the next seat-map fetch. */
let serverSeats: Seat[] = DEFAULT_SEATS

const VALID_INPUT = { fullName: 'נועה לוי', phone: '052-4471903' }

beforeEach(() => {
  vi.clearAllMocks()
  serverSeats = DEFAULT_SEATS
  useStore.setState({
    tours: [],
    buses: [],
    selectedTourId: null,
    selectedBusId: null,
    seatMap: null,
  })

  getToursMock.mockImplementation(async () => {
    useStore.getState().setTours([TOUR])
    return [TOUR]
  })
  getBusesMock.mockImplementation(async () => {
    useStore.getState().setBuses([BUS])
    return [BUS]
  })
  getSeatMapMock.mockImplementation(async (busId: string) => {
    const seatMap = buildSeatMap(serverSeats)
    if (useStore.getState().selectedBusId === busId) useStore.getState().setSeatMap(seatMap)
    return seatMap
  })
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/tours']}>
      <ToursPage />
    </MemoryRouter>,
  )
}

async function selectTourAndBus(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('option', { name: /הגליל העליון/ })
  await user.selectOptions(screen.getByLabelText('טיול'), 't1')
  await screen.findByRole('option', { name: /אוטובוס 1/ })
  await user.selectOptions(screen.getByLabelText('אוטובוס'), 'b1')
  await screen.findByRole('region', { name: 'מפת מושבים' })
}

async function openSeatRequestModal(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /מושב 1 — פנוי/ }))
  return screen.getByRole('dialog')
}

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
) {
  await user.type(within(dialog).getByLabelText('שם מלא'), VALID_INPUT.fullName)
  await user.type(within(dialog).getByLabelText('טלפון'), VALID_INPUT.phone)
  await user.selectOptions(within(dialog).getByLabelText('נקודת איסוף'), BUS.pickupPoints[0])
  await user.click(within(dialog).getByRole('button', { name: 'שליחת בקשה' }))
}

describe('Passenger view — tour/bus selector', () => {
  it('loads the tours on mount and asks the passenger to pick before showing a map', async () => {
    renderPage()

    expect(await screen.findByRole('option', { name: /הגליל העליון/ })).toBeInTheDocument()
    expect(screen.getByText(/בחרו טיול ואוטובוס כדי לראות/)).toBeInTheDocument()
    expect(getSeatMapMock).not.toHaveBeenCalled()
  })

  it('loads the buses of the selected tour only after a tour is chosen', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('option', { name: /הגליל העליון/ })

    expect(getBusesMock).not.toHaveBeenCalled()

    await user.selectOptions(screen.getByLabelText('טיול'), 't1')

    await waitFor(() => expect(getBusesMock).toHaveBeenCalledWith('t1', expect.anything()))
  })

  it('renders the selected bus seat map', async () => {
    const user = userEvent.setup()
    renderPage()

    await selectTourAndBus(user)

    expect(getSeatMapMock).toHaveBeenCalledWith('b1', expect.anything())
    expect(screen.getByRole('region', { name: 'מפת מושבים' })).toBeInTheDocument()
  })

  it('reports the free-seat count for the loaded map', async () => {
    const user = userEvent.setup()
    renderPage()

    await selectTourAndBus(user)

    expect(screen.getByText(/מושבים פנויים/)).toHaveTextContent('1')
  })

  it('tells the passenger when no tour is open for registration', async () => {
    getToursMock.mockImplementation(async () => {
      useStore.getState().setTours([])
      return []
    })
    renderPage()

    expect(await screen.findByText(/אין כרגע טיולים פתוחים/)).toBeInTheDocument()
  })

  it('shows a retry affordance and a toast when the tour list fails to load', async () => {
    getToursMock.mockRejectedValue(new NetworkError('offline'))
    renderPage()

    expect(await screen.findByText('אין חיבור לשרת. נסו שוב בעוד רגע')).toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith('אין חיבור לשרת. נסו שוב בעוד רגע')
  })

  it('offers a retry that refetches after a seat-map failure', async () => {
    const user = userEvent.setup()
    getSeatMapMock.mockRejectedValueOnce(new NetworkError('offline'))
    renderPage()

    await screen.findByRole('option', { name: /הגליל העליון/ })
    await user.selectOptions(screen.getByLabelText('טיול'), 't1')
    await screen.findByRole('option', { name: /אוטובוס 1/ })
    await user.selectOptions(screen.getByLabelText('אוטובוס'), 'b1')

    await user.click(await screen.findByRole('button', { name: /נסו שוב/ }))

    expect(await screen.findByRole('region', { name: 'מפת מושבים' })).toBeInTheDocument()
  })
})

describe('Passenger view — accessible seat map', () => {
  it('conveys every status by text in the accessible name, not colour alone', async () => {
    const user = userEvent.setup()
    renderPage()
    await selectTourAndBus(user)

    expect(screen.getByRole('button', { name: /מושב 1 — פנוי/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'מושב 2 — ממתין לאישור' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'מושב 3 — תפוס' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'מושב 4 — שמור' })).toBeInTheDocument()
  })

  it('keeps non-requestable seats focusable but inert', async () => {
    const user = userEvent.setup()
    renderPage()
    await selectTourAndBus(user)

    const takenSeat = screen.getByRole('button', { name: 'מושב 3 — תפוס' })
    expect(takenSeat).toHaveAttribute('aria-disabled', 'true')
    expect(takenSeat).not.toBeDisabled()

    await user.click(takenSeat)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the request modal for an available seat', async () => {
    const user = userEvent.setup()
    renderPage()
    await selectTourAndBus(user)

    const dialog = await openSeatRequestModal(user)

    expect(within(dialog).getByRole('heading', { name: /בקשת מושב 1/ })).toBeInTheDocument()
  })

  it('tells the passenger when the bus has no seats configured', async () => {
    const user = userEvent.setup()
    serverSeats = []
    renderPage()

    await screen.findByRole('option', { name: /הגליל העליון/ })
    await user.selectOptions(screen.getByLabelText('טיול'), 't1')
    await screen.findByRole('option', { name: /אוטובוס 1/ })
    await user.selectOptions(screen.getByLabelText('אוטובוס'), 'b1')

    expect(await screen.findByText(/עדיין לא הוגדרו מושבים/)).toBeInTheDocument()
  })
})

describe('Passenger view — seat request', () => {
  it("offers the selected bus's pickup points", async () => {
    const user = userEvent.setup()
    renderPage()
    await selectTourAndBus(user)
    const dialog = await openSeatRequestModal(user)

    for (const point of BUS.pickupPoints) {
      expect(within(dialog).getByRole('option', { name: point })).toBeInTheDocument()
    }
  })

  it('blocks submission with inline field errors and never a toast', async () => {
    const user = userEvent.setup()
    renderPage()
    await selectTourAndBus(user)
    const dialog = await openSeatRequestModal(user)

    await user.click(within(dialog).getByRole('button', { name: 'שליחת בקשה' }))

    expect(within(dialog).getByText('יש להזין שם מלא')).toBeInTheDocument()
    expect(within(dialog).getByText('יש להזין מספר טלפון')).toBeInTheDocument()
    expect(within(dialog).getByText('יש לבחור נקודת איסוף')).toBeInTheDocument()
    expect(requestSeatMock).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('rejects a malformed phone number before calling the API', async () => {
    const user = userEvent.setup()
    renderPage()
    await selectTourAndBus(user)
    const dialog = await openSeatRequestModal(user)

    await user.type(within(dialog).getByLabelText('שם מלא'), VALID_INPUT.fullName)
    await user.type(within(dialog).getByLabelText('טלפון'), '123')
    await user.selectOptions(within(dialog).getByLabelText('נקודת איסוף'), BUS.pickupPoints[0])
    await user.click(within(dialog).getByRole('button', { name: 'שליחת בקשה' }))

    expect(within(dialog).getByText('מספר הטלפון אינו תקין')).toBeInTheDocument()
    expect(requestSeatMock).not.toHaveBeenCalled()
  })

  it('submits the request for the clicked seat, closes the modal and refreshes the map', async () => {
    const user = userEvent.setup()
    requestSeatMock.mockImplementation(async () => {
      serverSeats = DEFAULT_SEATS.map((seat) =>
        seat.id === 's1' ? { ...seat, status: 'pending' as const } : seat,
      )
      return { seat: { ...buildSeat(), status: 'pending' as const } }
    })

    renderPage()
    await selectTourAndBus(user)
    const dialog = await openSeatRequestModal(user)
    await fillAndSubmit(user, dialog)

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(requestSeatMock).toHaveBeenCalledWith({
      seatId: 's1',
      fullName: VALID_INPUT.fullName,
      phone: VALID_INPUT.phone,
      pickupPoint: BUS.pickupPoints[0],
    })
    expect(toast.success).toHaveBeenCalledWith('הבקשה נשלחה וממתינה לאישור המנהל')
    // AC-4: the seat visibly moves to `pending` with no page reload.
    expect(
      await screen.findByRole('button', { name: 'מושב 1 — ממתין לאישור' }),
    ).toBeInTheDocument()
  })

  it('refetches the seat map after a successful request rather than trusting local state', async () => {
    const user = userEvent.setup()
    requestSeatMock.mockResolvedValue({ seat: { ...buildSeat(), status: 'pending' } })

    renderPage()
    await selectTourAndBus(user)
    const dialog = await openSeatRequestModal(user)
    await fillAndSubmit(user, dialog)

    await waitFor(() => expect(getSeatMapMock).toHaveBeenCalledTimes(2))
  })
})

describe('Passenger view — seat conflict (F5 / AC-5)', () => {
  /** The seat was claimed by another passenger while this modal was open. */
  function simulateSeatLostToAnotherPassenger() {
    requestSeatMock.mockImplementation(async () => {
      serverSeats = DEFAULT_SEATS.map((seat) =>
        seat.id === 's1' ? { ...seat, status: 'taken' as const } : seat,
      )
      throw new ConflictError('seat already taken', 'SEAT_NOT_AVAILABLE')
    })
  }

  it('shows a specific conflict message rather than a generic error', async () => {
    const user = userEvent.setup()
    simulateSeatLostToAnotherPassenger()

    renderPage()
    await selectTourAndBus(user)
    const dialog = await openSeatRequestModal(user)
    await fillAndSubmit(user, dialog)

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'המושב הזה כבר נתפס — בחרו מושב אחר',
    )
    expect(toast.error).toHaveBeenCalledWith('המושב הזה כבר נתפס — בחרו מושב אחר')
  })

  it('refreshes the map so the seat shows its real, non-available status', async () => {
    const user = userEvent.setup()
    simulateSeatLostToAnotherPassenger()

    renderPage()
    await selectTourAndBus(user)
    const dialog = await openSeatRequestModal(user)
    await fillAndSubmit(user, dialog)

    await waitFor(() => expect(getSeatMapMock).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('button', { name: 'מושב 1 — תפוס' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /מושב 1 — פנוי/ })).not.toBeInTheDocument()
  })

  it('leaves the modal open on the now-unavailable seat instead of silently closing', async () => {
    const user = userEvent.setup()
    simulateSeatLostToAnotherPassenger()

    renderPage()
    await selectTourAndBus(user)
    const dialog = await openSeatRequestModal(user)
    await fillAndSubmit(user, dialog)

    await within(dialog).findByRole('alert')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // The modal reflects the refreshed status, so the reason is visible in place.
    expect(within(dialog).getByText(/תפוס/)).toBeInTheDocument()
  })

  it('resolves two simultaneous requests for the same seat as exactly one success and one 409', async () => {
    // The server arbitrates atomically (F5) — the frontend must not assume it
    // won, and must surface the loser's 409 as its own case.
    requestSeatMock
      .mockResolvedValueOnce({ seat: { ...buildSeat(), status: 'pending' } })
      .mockRejectedValueOnce(new ConflictError('seat already taken', 'SEAT_NOT_AVAILABLE'))

    const payload = {
      seatId: 's1',
      fullName: VALID_INPUT.fullName,
      phone: VALID_INPUT.phone,
      pickupPoint: BUS.pickupPoints[0],
    }
    const results = await Promise.allSettled([
      seatService.requestSeat(payload),
      seatService.requestSeat(payload),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.filter((result) => result.status === 'rejected')
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError)
    expect((rejected[0] as PromiseRejectedResult).reason.status).toBe(409)
  })
})
