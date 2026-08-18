import { AxiosError, AxiosHeaders } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { AppRoutes } from '../App'
import { timeSlotService } from '../services/timeSlot.service'
import { serviceService } from '../services/service.service'
import { useStore } from '../store/store'
import { formatTimeRange, shiftDateKey, todayKey } from '../utils/date.utils'
import { buildTimeSlot } from '../test/factories'

vi.mock('../services/timeSlot.service', async () => {
  // The real conflict predicate is preserved — recognising a 409 is precisely
  // the behaviour these tests exist to prove.
  const actual =
    await vi.importActual<typeof import('../services/timeSlot.service')>(
      '../services/timeSlot.service',
    )

  return { ...actual, timeSlotService: { getList: vi.fn(), hold: vi.fn() } }
})

vi.mock('../services/service.service', () => ({
  serviceService: { getList: vi.fn() },
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
  Toaster: () => null,
}))

const { toast } = await import('sonner')
const mockedGetList = vi.mocked(timeSlotService.getList)
const mockedHold = vi.mocked(timeSlotService.hold)
const mockedToastError = vi.mocked(toast.error)
const mockedToastSuccess = vi.mocked(toast.success)

vi.mocked(serviceService.getList).mockResolvedValue([])

const TODAY = todayKey()

function buildConflictError(): AxiosError {
  const error = new AxiosError('Request failed with status code 409')
  error.response = {
    status: 409,
    statusText: 'Conflict',
    data: { error: 'Conflict' },
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  }
  return error
}

const renderPicker = () =>
  render(
    <MemoryRouter initialEntries={['/book/svc-1']}>
      <AppRoutes />
    </MemoryRouter>,
  )

/**
 * Accessible name of a slot button, per the `timeSlot.holdAria` Hebrew string.
 * The time range is built with the app's own formatter rather than typed out:
 * it separates the times with thin spaces, which accessible-name matching does
 * not normalize away, so a hand-written range would silently never match.
 */
const slotName = (start: string, end: string) =>
  `בחירת השעה ${formatTimeRange(start, end)}, פנויה`

describe('Time Slot Picker page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(serviceService.getList).mockResolvedValue([])
  })

  it('loads the open times for the chosen service and today by default', async () => {
    mockedGetList.mockResolvedValue([buildTimeSlot({ startTime: '09:00', endTime: '09:45' })])

    renderPicker()

    await screen.findByRole('button', { name: slotName('09:00', '09:45') })
    expect(mockedGetList).toHaveBeenCalledWith('svc-1', TODAY)
  })

  it('lists every open time as its own button', async () => {
    mockedGetList.mockResolvedValue([
      buildTimeSlot({ id: 'a', startTime: '09:00', endTime: '09:45' }),
      buildTimeSlot({ id: 'b', startTime: '10:00', endTime: '10:45' }),
    ])

    renderPicker()

    const list = await screen.findByRole('list', { name: /שעות פנויות בתאריך/ })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    // Plain spaces here on purpose: getByText normalizes the rendered thin
    // spaces down to ordinary ones, unlike accessible-name matching above.
    expect(within(list).getByText('10:00 – 10:45')).toBeInTheDocument()
  })

  it('shows a loading state while the request is in flight', async () => {
    mockedGetList.mockImplementation(() => new Promise(() => {}))

    renderPicker()

    expect(await screen.findByText('טוענים את השעות הפנויות…')).toBeInTheDocument()
  })

  it('shows a clear empty message instead of a blank day', async () => {
    mockedGetList.mockResolvedValue([])

    renderPicker()

    expect(await screen.findByText('אין שעות פנויות ביום זה')).toBeInTheDocument()
  })

  it('shows an error state with a working retry when loading fails', async () => {
    const user = userEvent.setup()
    mockedGetList.mockRejectedValueOnce(new Error('Network Error'))

    renderPicker()

    expect(await screen.findByText('לא הצלחנו לטעון את השעות הפנויות')).toBeInTheDocument()
    expect(mockedToastError).toHaveBeenCalledTimes(1)

    mockedGetList.mockResolvedValueOnce([buildTimeSlot({ startTime: '11:00', endTime: '11:45' })])
    await user.click(screen.getByRole('button', { name: 'נסו שוב' }))

    expect(
      await screen.findByRole('button', { name: slotName('11:00', '11:45') }),
    ).toBeInTheDocument()
  })

  it('refetches the times when another date is chosen', async () => {
    const user = userEvent.setup()
    const tomorrow = shiftDateKey(TODAY, 1)
    mockedGetList.mockResolvedValue([buildTimeSlot({ startTime: '09:00', endTime: '09:45' })])

    renderPicker()
    await screen.findByRole('button', { name: slotName('09:00', '09:45') })

    await user.click(screen.getByRole('button', { name: 'ליום הבא' }))

    await waitFor(() => expect(mockedGetList).toHaveBeenCalledWith('svc-1', tomorrow))
  })

  it('never lets the customer browse into a day that already passed', async () => {
    mockedGetList.mockResolvedValue([])

    renderPicker()

    // Today is the floor, so the "previous day" stepper starts unavailable.
    expect(await screen.findByRole('button', { name: 'ליום הקודם' })).toBeDisabled()
  })

  it('explains rather than fetching when the stored day is already in the past', async () => {
    useStore.setState({ selectedDate: shiftDateKey(TODAY, -3) })

    renderPicker()

    expect(await screen.findByText('התאריך הזה כבר עבר')).toBeInTheDocument()
    expect(mockedGetList).not.toHaveBeenCalled()
  })
})

describe('holding a time slot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(serviceService.getList).mockResolvedValue([])
  })

  it('holds the slot and moves the customer on to their details', async () => {
    const user = userEvent.setup()
    const slot = buildTimeSlot({ id: 'slot-1', startTime: '09:00', endTime: '09:45' })
    mockedGetList.mockResolvedValue([slot])
    mockedHold.mockResolvedValue({ ...slot, status: 'held' })

    renderPicker()

    await user.click(await screen.findByRole('button', { name: slotName('09:00', '09:45') }))

    expect(mockedHold).toHaveBeenCalledWith('slot-1')
    expect(await screen.findByRole('heading', { level: 1, name: 'הפרטים שלכם' })).toBeInTheDocument()
    expect(mockedToastSuccess).toHaveBeenCalledTimes(1)
  })

  it('carries the held time through to the details screen', async () => {
    const user = userEvent.setup()
    const slot = buildTimeSlot({ id: 'slot-1', startTime: '14:00', endTime: '14:45' })
    mockedGetList.mockResolvedValue([slot])
    mockedHold.mockResolvedValue({ ...slot, status: 'held' })

    renderPicker()

    await user.click(await screen.findByRole('button', { name: slotName('14:00', '14:45') }))

    await screen.findByRole('heading', { level: 1, name: 'הפרטים שלכם' })
    expect(screen.getByText('14:00 – 14:45')).toBeInTheDocument()
  })

  it('tells the customer the time was just taken and refreshes the list on a 409', async () => {
    const user = userEvent.setup()
    const taken = buildTimeSlot({ id: 'slot-1', startTime: '09:00', endTime: '09:45' })
    const remaining = buildTimeSlot({ id: 'slot-2', startTime: '10:00', endTime: '10:45' })

    mockedGetList.mockResolvedValueOnce([taken, remaining])
    mockedHold.mockRejectedValue(buildConflictError())
    mockedGetList.mockResolvedValueOnce([remaining])

    renderPicker()

    await user.click(await screen.findByRole('button', { name: slotName('09:00', '09:45') }))

    // The explanation is announced, and the slot someone else won is gone.
    expect(await screen.findByRole('alert')).toHaveTextContent('השעה הזו נתפסה הרגע')
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: slotName('09:00', '09:45') }),
      ).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: slotName('10:00', '10:45') })).toBeInTheDocument()
  })

  it('keeps the customer on the picker when the hold is lost', async () => {
    const user = userEvent.setup()
    const slot = buildTimeSlot({ id: 'slot-1', startTime: '09:00', endTime: '09:45' })
    mockedGetList.mockResolvedValueOnce([slot]).mockResolvedValueOnce([])
    mockedHold.mockRejectedValue(buildConflictError())

    renderPicker()

    await user.click(await screen.findByRole('button', { name: slotName('09:00', '09:45') }))

    await screen.findByRole('alert')
    expect(screen.queryByRole('heading', { name: 'הפרטים שלכם' })).not.toBeInTheDocument()
    expect(mockedToastError).toHaveBeenCalledTimes(1)
  })

  it('lets the customer dismiss the conflict message', async () => {
    const user = userEvent.setup()
    const slot = buildTimeSlot({ id: 'slot-1', startTime: '09:00', endTime: '09:45' })
    mockedGetList.mockResolvedValueOnce([slot]).mockResolvedValueOnce([])
    mockedHold.mockRejectedValue(buildConflictError())

    renderPicker()

    await user.click(await screen.findByRole('button', { name: slotName('09:00', '09:45') }))
    await screen.findByRole('alert')

    await user.click(screen.getByRole('button', { name: 'סגירת ההודעה' }))

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('reports a generic failure differently from a lost race', async () => {
    const user = userEvent.setup()
    const slot = buildTimeSlot({ id: 'slot-1', startTime: '09:00', endTime: '09:45' })
    mockedGetList.mockResolvedValue([slot])
    mockedHold.mockRejectedValue(new Error('Network Error'))

    renderPicker()

    await user.click(await screen.findByRole('button', { name: slotName('09:00', '09:45') }))

    await waitFor(() => expect(mockedToastError).toHaveBeenCalledTimes(1))
    // A network failure is not a conflict, so no "just taken" banner appears.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('blocks a second hold while one is already in flight', async () => {
    const user = userEvent.setup()
    const first = buildTimeSlot({ id: 'slot-1', startTime: '09:00', endTime: '09:45' })
    const second = buildTimeSlot({ id: 'slot-2', startTime: '10:00', endTime: '10:45' })
    mockedGetList.mockResolvedValue([first, second])
    mockedHold.mockImplementation(() => new Promise(() => {}))

    renderPicker()

    await user.click(await screen.findByRole('button', { name: slotName('09:00', '09:45') }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: slotName('10:00', '10:45') })).toBeDisabled(),
    )
    expect(mockedHold).toHaveBeenCalledTimes(1)
  })
})

describe('time slot accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(serviceService.getList).mockResolvedValue([])
  })

  it('states availability in words and an icon, never by colour alone', async () => {
    mockedGetList.mockResolvedValue([buildTimeSlot({ startTime: '09:00', endTime: '09:45' })])

    renderPicker()

    const slot = await screen.findByRole('button', { name: slotName('09:00', '09:45') })
    // The visible "פנוי" label carries the same meaning the tint does.
    expect(within(slot).getByText('פנוי')).toBeInTheDocument()
  })

  it('reaches and activates a time with the keyboard alone', async () => {
    const user = userEvent.setup()
    const slot = buildTimeSlot({ id: 'slot-1', startTime: '09:00', endTime: '09:45' })
    mockedGetList.mockResolvedValue([slot])
    mockedHold.mockResolvedValue({ ...slot, status: 'held' })

    renderPicker()

    const button = await screen.findByRole('button', { name: slotName('09:00', '09:45') })
    button.focus()
    expect(button).toHaveFocus()

    await user.keyboard('{Enter}')

    expect(await screen.findByRole('heading', { level: 1, name: 'הפרטים שלכם' })).toBeInTheDocument()
  })

  it('gives the date field a real label so it is reachable by name', async () => {
    mockedGetList.mockResolvedValue([])

    renderPicker()

    expect(await screen.findByLabelText('תאריך')).toBeInTheDocument()
  })

  it('marks the slot region busy while the times are loading', async () => {
    mockedGetList.mockImplementation(() => new Promise(() => {}))

    const { container } = renderPicker()

    await waitFor(() =>
      expect(container.querySelector('[aria-live="polite"]')).toHaveAttribute('aria-busy', 'true'),
    )
  })
})
