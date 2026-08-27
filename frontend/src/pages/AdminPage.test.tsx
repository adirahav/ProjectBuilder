import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { AdminPage } from './AdminPage'
import { AdminRoute } from '../components/routing/AdminRoute'
import { busService } from '../services/bus.service'
import { manifestService } from '../services/manifest.service'
import { seatService } from '../services/seat.service'
import { tourService } from '../services/tour.service'
import { ApiError, NetworkError } from '../services/http.service'
import { useStore } from '../store/store'
import type { AuthUser } from '../types/auth.types'
import type { Manifest } from '../types/manifest.types'
import type { Seat, SeatMap } from '../types/seat.types'

/**
 * Screen 4 behaviour tests (plan 009): the admin guard, the three-tab shell, and
 * each tab's read view — including the manifest's filter, search, and copy
 * contract (PRD F15/F16, AC-14).
 *
 * Every domain service is mocked, so no test reaches `http.service.ts` or a real
 * API (.rule/testing-rules.md). Each mock performs the same store write its real
 * counterpart does, since components rely on the service — never their own
 * duplicate update — to move global state.
 */

vi.mock('../services/tour.service', () => ({ tourService: { getTours: vi.fn() } }))
vi.mock('../services/bus.service', () => ({
  busService: { getBusesByTour: vi.fn(), listBusesForTour: vi.fn() },
}))
vi.mock('../services/seat.service', () => ({
  seatService: { getSeatMap: vi.fn(), requestSeat: vi.fn() },
}))
vi.mock('../services/manifest.service', () => ({ manifestService: { getManifest: vi.fn() } }))
vi.mock('../services/auth.service', () => ({ authService: { logout: vi.fn() } }))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}))

const getToursMock = vi.mocked(tourService.getTours)
const getBusesMock = vi.mocked(busService.getBusesByTour)
const listBusesMock = vi.mocked(busService.listBusesForTour)
const getSeatMapMock = vi.mocked(seatService.getSeatMap)
const getManifestMock = vi.mocked(manifestService.getManifest)

const TOUR = { id: 't1', name: 'הגליל העליון', startDate: '2026-04-12', endDate: '2026-04-14' }
const BUS = {
  id: 'b1',
  tourId: 't1',
  name: 'אוטובוס 1',
  seatCount: 4,
  pickupPoints: ['תחנה מרכזית תל אביב', 'צומת גלילות'],
}

const ADMIN_USER: AuthUser = {
  id: 'a1',
  fullName: 'הילה מנהלת',
  email: 'hila@example.com',
  roles: ['admin'],
}

function buildSeat(overrides: Partial<Seat> = {}): Seat {
  return { id: 's1', busId: 'b1', label: '1', row: 1, column: 1, status: 'available', ...overrides }
}

const SEATS: Seat[] = [
  buildSeat({ id: 's1', label: '1', column: 1, status: 'available' }),
  buildSeat({ id: 's2', label: '2', column: 2, status: 'pending' }),
  buildSeat({ id: 's3', label: '3', column: 3, status: 'taken' }),
  buildSeat({ id: 's4', label: '4', column: 4, status: 'reserved' }),
]

const SEAT_MAP: SeatMap = {
  bus: {
    id: BUS.id,
    name: BUS.name,
    seatCount: BUS.seatCount,
    pickupPoints: BUS.pickupPoints,
    aisleAfterColumn: 2,
  },
  seats: SEATS,
}

const MANIFEST: Manifest = {
  bus: { id: 'b1', name: 'אוטובוס 1', seatCount: 4 },
  rows: [
    {
      seatId: 's3',
      seatLabel: '3',
      status: 'taken',
      fullName: 'נועה לוי',
      phone: '0524471903',
      pickupPoint: 'צומת גלילות',
    },
    {
      seatId: 's2',
      seatLabel: '2',
      status: 'pending',
      fullName: 'דנה כהן',
      phone: '0501112233',
      pickupPoint: 'תחנה מרכזית תל אביב',
    },
    { seatId: 's1', seatLabel: '1', status: 'available' },
    { seatId: 's4', seatLabel: '4', status: 'reserved' },
  ],
}

const writeTextMock = vi.fn<(text: string) => Promise<void>>()

beforeEach(() => {
  vi.clearAllMocks()
  useStore.setState({
    currentUser: ADMIN_USER,
    isAuthenticated: true,
    isAdminSession: true,
    tours: [],
    buses: [],
    selectedTourId: null,
    selectedBusId: null,
    seatMap: null,
    manifest: null,
  })

  getToursMock.mockImplementation(async () => {
    useStore.getState().setTours([TOUR])
    return [TOUR]
  })
  getBusesMock.mockImplementation(async () => {
    useStore.getState().setBuses([BUS])
    return [BUS]
  })
  listBusesMock.mockResolvedValue([BUS])
  getSeatMapMock.mockImplementation(async (busId: string) => {
    if (useStore.getState().selectedBusId === busId) useStore.getState().setSeatMap(SEAT_MAP)
    return SEAT_MAP
  })
  getManifestMock.mockImplementation(async (busId: string) => {
    if (useStore.getState().selectedBusId === busId) useStore.getState().setManifest(MANIFEST)
    return MANIFEST
  })

  writeTextMock.mockResolvedValue(undefined)
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: { writeText: writeTextMock },
    configurable: true,
  })
})

/**
 * `userEvent.setup()` installs its own `navigator.clipboard` stub, which would
 * silently replace the mock wired up in `beforeEach` — the copy assertions would
 * then watch a spy the component never calls. Reinstalling afterwards keeps the
 * component talking to our mock.
 */
function setupUser() {
  const user = userEvent.setup()
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: { writeText: writeTextMock },
    configurable: true,
  })
  return user
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function openTab(user: ReturnType<typeof userEvent.setup>, name: string | RegExp) {
  await user.click(screen.getByRole('tab', { name }))
}

async function selectTourAndBus(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('option', { name: /הגליל העליון/ })
  await user.selectOptions(screen.getByLabelText('טיול'), 't1')
  await screen.findByRole('option', { name: /אוטובוס 1/ })
  await user.selectOptions(screen.getByLabelText('אוטובוס'), 'b1')
}

describe('AdminRoute guard', () => {
  it('renders the dashboard for an admin session', () => {
    render(
      <MemoryRouter>
        <AdminRoute>
          <p>תוכן מוגן</p>
        </AdminRoute>
      </MemoryRouter>,
    )

    expect(screen.getByText('תוכן מוגן')).toBeInTheDocument()
  })

  it('withholds the content and explains why when there is no admin session', () => {
    useStore.setState({ currentUser: null, isAuthenticated: false, isAdminSession: false })

    render(
      <MemoryRouter>
        <AdminRoute>
          <p>תוכן מוגן</p>
        </AdminRoute>
      </MemoryRouter>,
    )

    expect(screen.queryByText('תוכן מוגן')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'נדרשת התחברות כמנהל' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'למסך הכניסה' })).toBeInTheDocument()
  })

  it('guards the /admin route itself, not just the page component', () => {
    useStore.setState({ currentUser: null, isAuthenticated: false, isAdminSession: false })
    globalThis.history.pushState({}, '', '/admin')

    render(<App />)

    expect(screen.getByRole('heading', { name: 'נדרשת התחברות כמנהל' })).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })
})

describe('Admin dashboard — tab shell', () => {
  it('exposes the three tabs as a real tablist', () => {
    renderPage()

    const tablist = screen.getByRole('tablist', { name: 'אזורי לוח הניהול' })
    const tabs = within(tablist).getAllByRole('tab')

    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'ניהול מושבים',
      'טיולים ואוטובוסים',
      'רשימת נוסעים',
    ])
  })

  it('opens on Seat Management', () => {
    renderPage()

    expect(screen.getByRole('tab', { name: 'ניהול מושבים' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tabpanel')).toBeInTheDocument()
  })

  it('switches the visible panel without leaving the page', async () => {
    const user = setupUser()
    renderPage()

    await openTab(user, 'רשימת נוסעים')

    expect(screen.getByRole('tab', { name: 'רשימת נוסעים' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: 'ניהול מושבים' })).toHaveAttribute(
      'aria-selected',
      'false',
    )
    expect(await screen.findByText(/בחרו טיול ואוטובוס כדי לראות את רשימת הנוסעים/)).toBeInTheDocument()
  })

  it('moves between tabs with the arrow keys, mirrored for RTL', async () => {
    const user = setupUser()
    renderPage()

    screen.getByRole('tab', { name: 'ניהול מושבים' }).focus()
    await user.keyboard('{ArrowLeft}')

    expect(screen.getByRole('tab', { name: 'טיולים ואוטובוסים' })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    await user.keyboard('{ArrowRight}')

    expect(screen.getByRole('tab', { name: 'ניהול מושבים' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('keeps only the active tab in the tab order (roving tabindex)', () => {
    renderPage()

    expect(screen.getByRole('tab', { name: 'ניהול מושבים' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'רשימת נוסעים' })).toHaveAttribute('tabindex', '-1')
  })

  it('preserves the tour/bus selection when switching between tabs', async () => {
    const user = setupUser()
    renderPage()

    await selectTourAndBus(user)
    await screen.findByRole('region', { name: 'מפת מושבים' })

    await openTab(user, 'רשימת נוסעים')

    expect(await screen.findByRole('region', { name: 'רשימת נוסעים' })).toBeInTheDocument()
    expect(useStore.getState().selectedBusId).toBe('b1')
    expect(getManifestMock).toHaveBeenCalledWith('b1', expect.anything())
  })

  it('greets the signed-in admin and offers a logout', () => {
    renderPage()

    expect(screen.getByText('הילה מנהלת')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /התנתקות/ })).toBeInTheDocument()
  })
})

describe('Admin dashboard — Seat Management tab (4a)', () => {
  it('asks for a tour and bus before fetching anything', async () => {
    renderPage()

    expect(await screen.findByText(/בחרו טיול ואוטובוס כדי לראות את מפת המושבים/)).toBeInTheDocument()
    expect(getSeatMapMock).not.toHaveBeenCalled()
  })

  it('renders the seat map for the selected bus', async () => {
    const user = setupUser()
    renderPage()

    await selectTourAndBus(user)

    expect(await screen.findByRole('region', { name: 'מפת מושבים' })).toBeInTheDocument()
    expect(getSeatMapMock).toHaveBeenCalledWith('b1', expect.anything())
  })

  it('conveys every seat status by text, not colour alone', async () => {
    const user = setupUser()
    renderPage()
    await selectTourAndBus(user)
    await screen.findByRole('region', { name: 'מפת מושבים' })

    expect(screen.getByRole('button', { name: 'מושב 1 — פנוי' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'מושב 2 — ממתין לאישור' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'מושב 3 — תפוס' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'מושב 4 — שמור' })).toBeInTheDocument()
  })

  it('renders the map read-only — an available seat announces no request action', async () => {
    const user = setupUser()
    renderPage()
    await selectTourAndBus(user)
    await screen.findByRole('region', { name: 'מפת מושבים' })

    const availableSeat = screen.getByRole('button', { name: 'מושב 1 — פנוי' })
    expect(availableSeat).toHaveAttribute('aria-disabled', 'true')

    await user.click(availableSeat)

    // The passenger request modal must never open from the admin tab.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('omits the deferred quick-action buttons rather than showing them disabled', async () => {
    const user = setupUser()
    renderPage()
    await selectTourAndBus(user)
    await screen.findByRole('region', { name: 'מפת מושבים' })

    expect(screen.queryByRole('button', { name: /אישור מושב/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /שחרור/ })).not.toBeInTheDocument()
  })

  it('summarizes how many seats are free and how many await approval', async () => {
    const user = setupUser()
    renderPage()
    await selectTourAndBus(user)
    await screen.findByRole('region', { name: 'מפת מושבים' })

    expect(screen.getByText(/מושבים פנויים/)).toHaveTextContent('1')
    expect(screen.getByText(/ממתינים לאישור/)).toHaveTextContent('1')
  })

  it('offers a retry after a failed seat-map load', async () => {
    const user = setupUser()
    getSeatMapMock.mockRejectedValueOnce(new NetworkError('offline'))
    renderPage()

    await selectTourAndBus(user)

    const retry = await screen.findByRole('button', { name: /נסו שוב/ })
    await user.click(retry)

    expect(await screen.findByRole('region', { name: 'מפת מושבים' })).toBeInTheDocument()
  })
})

describe('Admin dashboard — Tours & Buses tab (4b)', () => {
  it('lists the tours without fetching any bus up front', async () => {
    const user = setupUser()
    renderPage()
    await openTab(user, 'טיולים ואוטובוסים')

    expect(await screen.findByRole('button', { name: /הגליל העליון/ })).toBeInTheDocument()
    expect(listBusesMock).not.toHaveBeenCalled()
  })

  it("loads and shows a tour's buses when it is expanded", async () => {
    const user = setupUser()
    renderPage()
    await openTab(user, 'טיולים ואוטובוסים')

    await user.click(await screen.findByRole('button', { name: /הגליל העליון/ }))

    await waitFor(() => expect(listBusesMock).toHaveBeenCalledWith('t1'))
    expect(await screen.findByText('אוטובוס 1')).toBeInTheDocument()
    expect(screen.getByText('צומת גלילות')).toBeInTheDocument()
  })

  it('reports the expanded state to assistive technology', async () => {
    const user = setupUser()
    renderPage()
    await openTab(user, 'טיולים ואוטובוסים')

    const toggle = await screen.findByRole('button', { name: /הגליל העליון/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('does not re-fetch a tour whose buses it already has', async () => {
    const user = setupUser()
    renderPage()
    await openTab(user, 'טיולים ואוטובוסים')

    const toggle = await screen.findByRole('button', { name: /הגליל העליון/ })
    await user.click(toggle)
    await screen.findByText('אוטובוס 1')
    await user.click(toggle)
    await user.click(toggle)

    await screen.findByText('אוטובוס 1')
    expect(listBusesMock).toHaveBeenCalledTimes(1)
  })

  it('does not clobber the tour/bus selection the other tabs share', async () => {
    const user = setupUser()
    renderPage()
    await selectTourAndBus(user)
    await screen.findByRole('region', { name: 'מפת מושבים' })

    await openTab(user, 'טיולים ואוטובוסים')
    await user.click(await screen.findByRole('button', { name: /הגליל העליון/ }))
    await screen.findByText('אוטובוס 1')

    expect(useStore.getState().selectedBusId).toBe('b1')
  })

  it('tells the admin when no tour exists yet', async () => {
    const user = setupUser()
    getToursMock.mockImplementation(async () => {
      useStore.getState().setTours([])
      return []
    })
    renderPage()
    await openTab(user, 'טיולים ואוטובוסים')

    expect(await screen.findByText('עדיין לא הוגדרו טיולים.')).toBeInTheDocument()
  })

  it('tells the admin when an expanded tour has no bus', async () => {
    const user = setupUser()
    listBusesMock.mockResolvedValue([])
    renderPage()
    await openTab(user, 'טיולים ואוטובוסים')

    await user.click(await screen.findByRole('button', { name: /הגליל העליון/ }))

    expect(await screen.findByText('לטיול הזה עדיין לא הוגדרו אוטובוסים.')).toBeInTheDocument()
  })

  it('offers a retry scoped to the tour whose buses failed to load', async () => {
    const user = setupUser()
    listBusesMock.mockRejectedValueOnce(new NetworkError('offline'))
    renderPage()
    await openTab(user, 'טיולים ואוטובוסים')

    await user.click(await screen.findByRole('button', { name: /הגליל העליון/ }))

    await user.click(await screen.findByRole('button', { name: /נסו שוב/ }))

    expect(await screen.findByText('אוטובוס 1')).toBeInTheDocument()
  })

  it('omits the deferred CRUD controls rather than showing them disabled', async () => {
    const user = setupUser()
    renderPage()
    await openTab(user, 'טיולים ואוטובוסים')
    await screen.findByRole('button', { name: /הגליל העליון/ })

    expect(screen.queryByRole('button', { name: /טיול חדש/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /מחיקה/ })).not.toBeInTheDocument()
  })
})

describe('Admin dashboard — Passenger Manifest tab (4c)', () => {
  async function openManifest(user: ReturnType<typeof userEvent.setup>) {
    await openTab(user, 'רשימת נוסעים')
    await selectTourAndBus(user)
    return screen.findByRole('region', { name: 'רשימת נוסעים' })
  }

  it('loads the manifest from the admin endpoint for the selected bus', async () => {
    const user = setupUser()
    renderPage()

    await openManifest(user)

    expect(getManifestMock).toHaveBeenCalledWith('b1', expect.anything())
  })

  it('shows each passenger with name, phone, pickup point and status', async () => {
    const user = setupUser()
    renderPage()
    const region = await openManifest(user)

    const row = within(region).getByRole('row', { name: /נועה לוי/ })
    expect(within(row).getByText('0524471903')).toBeInTheDocument()
    expect(within(row).getByText('צומת גלילות')).toBeInTheDocument()
    expect(within(row).getByText('תפוס')).toBeInTheDocument()
  })

  it('conveys each row status by text alongside its colour', async () => {
    const user = setupUser()
    renderPage()
    const region = await openManifest(user)

    // Scoped to the table: the status filter's <option> list spells the same
    // labels out, and matching those would prove nothing about the rows.
    const table = within(region).getByRole('table')
    expect(within(table).getByText('ממתין לאישור')).toBeInTheDocument()
    expect(within(table).getByText('שמור')).toBeInTheDocument()
    expect(within(table).getByText('פנוי')).toBeInTheDocument()
  })

  it('narrows the table by status (AC-14)', async () => {
    const user = setupUser()
    renderPage()
    const region = await openManifest(user)

    await user.selectOptions(screen.getByLabelText('סינון לפי סטטוס'), 'pending')

    expect(within(region).getByText('דנה כהן')).toBeInTheDocument()
    expect(within(region).queryByText('נועה לוי')).not.toBeInTheDocument()
  })

  it('narrows the table by a free-text search across name, phone and pickup point (AC-14)', async () => {
    const user = setupUser()
    renderPage()
    const region = await openManifest(user)

    await user.type(screen.getByLabelText('חיפוש'), 'גלילות')

    expect(within(region).getByText('נועה לוי')).toBeInTheDocument()
    expect(within(region).queryByText('דנה כהן')).not.toBeInTheDocument()
  })

  it('filters client-side, without another request to the server', async () => {
    const user = setupUser()
    renderPage()
    await openManifest(user)
    expect(getManifestMock).toHaveBeenCalledTimes(1)

    await user.type(screen.getByLabelText('חיפוש'), 'דנה')
    await user.selectOptions(screen.getByLabelText('סינון לפי סטטוס'), 'pending')

    expect(getManifestMock).toHaveBeenCalledTimes(1)
  })

  it('explains an empty table caused by the filter rather than by missing data', async () => {
    const user = setupUser()
    renderPage()
    await openManifest(user)

    await user.type(screen.getByLabelText('חיפוש'), 'אין כזה נוסע')

    expect(await screen.findByText('אין שורות שמתאימות לסינון הנוכחי.')).toBeInTheDocument()
  })

  it('copies a formatted report to the clipboard (F16 / AC-14)', async () => {
    const user = setupUser()
    renderPage()
    await openManifest(user)

    await user.click(screen.getByRole('button', { name: /העתקת דוח/ }))

    await waitFor(() => expect(writeTextMock).toHaveBeenCalledTimes(1))
    const report = writeTextMock.mock.calls[0][0]
    expect(report).toContain('רשימת נוסעים — אוטובוס 1')
    expect(report).toContain('נועה לוי')
    expect(report).toContain('0524471903')
  })

  it('confirms the copy inline instead of via a toast', async () => {
    const user = setupUser()
    renderPage()
    await openManifest(user)

    await user.click(screen.getByRole('button', { name: /העתקת דוח/ }))

    expect(await screen.findByText('הדוח הועתק ללוח')).toBeInTheDocument()
  })

  it('copies only the rows the current filter leaves visible', async () => {
    const user = setupUser()
    renderPage()
    await openManifest(user)

    await user.selectOptions(screen.getByLabelText('סינון לפי סטטוס'), 'pending')
    await user.click(screen.getByRole('button', { name: /העתקת דוח/ }))

    await waitFor(() => expect(writeTextMock).toHaveBeenCalledTimes(1))
    const report = writeTextMock.mock.calls[0][0]
    expect(report).toContain('דנה כהן')
    expect(report).not.toContain('נועה לוי')
  })

  it('tells the admin to copy manually when the clipboard is unavailable', async () => {
    const user = setupUser()
    writeTextMock.mockRejectedValue(new Error('denied'))
    renderPage()
    await openManifest(user)

    await user.click(screen.getByRole('button', { name: /העתקת דוח/ }))

    expect(
      await screen.findByText('העתקה ללוח נכשלה. נסו לסמן ולהעתיק ידנית'),
    ).toBeInTheDocument()
  })

  it('surfaces a failed manifest load with a retry rather than an empty table', async () => {
    const user = setupUser()
    getManifestMock.mockRejectedValueOnce(new ApiError(403, 'Forbidden'))
    renderPage()

    await openTab(user, 'רשימת נוסעים')
    await selectTourAndBus(user)

    expect(await screen.findByText('טעינת רשימת הנוסעים נכשלה')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /נסו שוב/ }))

    expect(await screen.findByRole('region', { name: 'רשימת נוסעים' })).toBeInTheDocument()
  })
})
