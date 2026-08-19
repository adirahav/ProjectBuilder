import { AxiosError, AxiosHeaders } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { AppRoutes } from '../App'
import { appointmentService } from '../services/appointment.service'
import { serviceService } from '../services/service.service'
import { timeSlotService } from '../services/timeSlot.service'
import { useStore } from '../store/store'
import { buildAppointment, buildHeldTimeSlot } from '../test/factories'

vi.mock('../services/appointment.service', async () => {
  // The real conflict predicate is preserved — recognising a 409 as a lapsed
  // hold is precisely the behaviour these tests exist to prove.
  const actual =
    await vi.importActual<typeof import('../services/appointment.service')>(
      '../services/appointment.service',
    )

  return { ...actual, appointmentService: { create: vi.fn() } }
})

vi.mock('../services/timeSlot.service', async () => {
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
const mockedCreate = vi.mocked(appointmentService.create)
const mockedToastError = vi.mocked(toast.error)
const mockedToastSuccess = vi.mocked(toast.success)

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

/** Renders straight onto Screen 3 with a slot already held, as Screen 2 leaves it. */
function renderDetails(remainingMs = 5 * 60 * 1000) {
  const heldSlot = buildHeldTimeSlot(remainingMs, {
    id: 'slot-1',
    serviceId: 'svc-1',
    startTime: '09:00',
    endTime: '09:45',
  })
  useStore.setState({ heldSlot })

  render(
    <MemoryRouter initialEntries={['/book/svc-1/details']}>
      <AppRoutes />
    </MemoryRouter>,
  )

  return heldSlot
}

const NAME_LABEL = 'שם מלא'
const PHONE_LABEL = 'מספר טלפון'
const EMAIL_LABEL = 'דוא״ל'
const SUBMIT_LABEL = 'הזמנת התור'

async function fillValidDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(new RegExp(NAME_LABEL)), 'דנה לוי')
  await user.type(screen.getByLabelText(new RegExp(PHONE_LABEL)), '050-123-4567')
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(serviceService.getList).mockResolvedValue([])
  vi.mocked(timeSlotService.getList).mockResolvedValue([])
})

describe('Customer Details page', () => {
  it('shows the time being held so the Customer knows what they are booking', () => {
    renderDetails()

    expect(screen.getByText('השעה השמורה עבורכם')).toBeInTheDocument()
    expect(screen.getByText('09:00 – 09:45')).toBeInTheDocument()
  })

  it('offers a name, phone and email field, each reachable by its label', () => {
    renderDetails()

    expect(screen.getByLabelText(new RegExp(NAME_LABEL))).toBeInTheDocument()
    expect(screen.getByLabelText(new RegExp(PHONE_LABEL))).toBeInTheDocument()
    expect(screen.getByLabelText(new RegExp(EMAIL_LABEL))).toBeInTheDocument()
  })

  it('explains rather than showing a form when no time is held', () => {
    render(
      <MemoryRouter initialEntries={['/book/svc-1/details']}>
        <AppRoutes />
      </MemoryRouter>,
    )

    expect(screen.getByText('עדיין לא נשמרה שעה')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: SUBMIT_LABEL })).not.toBeInTheDocument()
  })
})

describe('Customer Details validation', () => {
  it('refuses to book without a name or a phone, and says so inline', async () => {
    const user = userEvent.setup()
    renderDetails()

    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    expect(await screen.findByText(/אנא הזינו את שמכם/)).toBeInTheDocument()
    expect(screen.getByText(/אנא הזינו מספר טלפון/)).toBeInTheDocument()
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  it('never uses a toast for a problem it caught itself', async () => {
    const user = userEvent.setup()
    renderDetails()

    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    await screen.findByText(/אנא הזינו את שמכם/)
    expect(mockedToastError).not.toHaveBeenCalled()
  })

  it('announces a blocked submit instead of appearing to do nothing', async () => {
    const user = userEvent.setup()
    renderDetails()

    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    expect(await screen.findByRole('alert')).toHaveTextContent('אנא תקנו את השדות המסומנים')
  })

  it('marks the offending field invalid and ties the message to it', async () => {
    const user = userEvent.setup()
    renderDetails()

    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    const nameInput = await screen.findByLabelText(new RegExp(NAME_LABEL))
    expect(nameInput).toHaveAttribute('aria-invalid', 'true')
    expect(nameInput).toHaveAccessibleDescription(/אנא הזינו את שמכם/)
  })

  it('flags a malformed phone number only once the field is left', async () => {
    const user = userEvent.setup()
    renderDetails()

    await user.type(screen.getByLabelText(new RegExp(PHONE_LABEL)), '123')
    // Still typing: nothing has gone wrong yet as far as the Customer knows.
    expect(screen.queryByText(/אנא הזינו מספר טלפון תקין/)).not.toBeInTheDocument()

    await user.tab()

    expect(await screen.findByText(/אנא הזינו מספר טלפון תקין/)).toBeInTheDocument()
  })

  it('clears an error as soon as the Customer starts fixing it', async () => {
    const user = userEvent.setup()
    renderDetails()

    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))
    await screen.findByText(/אנא הזינו את שמכם/)

    await user.type(screen.getByLabelText(new RegExp(NAME_LABEL)), 'דנה')

    await waitFor(() => expect(screen.queryByText(/אנא הזינו את שמכם/)).not.toBeInTheDocument())
  })

  it('rejects a malformed email but treats an empty one as fine', async () => {
    const user = userEvent.setup()
    mockedCreate.mockResolvedValue(buildAppointment())
    renderDetails()

    await fillValidDetails(user)
    await user.type(screen.getByLabelText(new RegExp(EMAIL_LABEL)), 'not-an-address')
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    expect(await screen.findByText(/אנא הזינו כתובת דוא״ל תקינה/)).toBeInTheDocument()
    expect(mockedCreate).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText(new RegExp(EMAIL_LABEL)))
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1))
  })
})

describe('booking the appointment', () => {
  it('creates the Appointment from the held slot and the typed details', async () => {
    const user = userEvent.setup()
    mockedCreate.mockResolvedValue(buildAppointment())
    renderDetails()

    await fillValidDetails(user)
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('svc-1', 'slot-1', {
        customerName: 'דנה לוי',
        customerPhone: '050-123-4567',
        customerEmail: '',
      }),
    )
  })

  it('moves the Customer on to the confirmation once the booking lands', async () => {
    const user = userEvent.setup()
    mockedCreate.mockResolvedValue(buildAppointment({ id: 'appointment-abc' }))
    renderDetails()

    await fillValidDetails(user)
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'התור שלכם הוזמן' }),
    ).toBeInTheDocument()
    expect(screen.getByText('appointment-abc')).toBeInTheDocument()
    expect(mockedToastSuccess).toHaveBeenCalledTimes(1)
  })

  it('shows the booking as awaiting the clinic, never as already confirmed', async () => {
    const user = userEvent.setup()
    mockedCreate.mockResolvedValue(buildAppointment())
    renderDetails()

    await fillValidDetails(user)
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    await screen.findByRole('heading', { level: 1, name: 'התור שלכם הוזמן' })
    expect(screen.getByText('ממתין לאישור')).toBeInTheDocument()
  })

  it('blocks a second submit while the first is still in flight', async () => {
    const user = userEvent.setup()
    mockedCreate.mockImplementation(() => new Promise(() => {}))
    renderDetails()

    await fillValidDetails(user)
    await user.click(screen.getByRole('button', { name: /הזמנת התור|מזמינים את התור/ }))

    const button = await screen.findByRole('button', { name: 'מזמינים את התור…' })
    expect(button).toBeDisabled()
    expect(mockedCreate).toHaveBeenCalledTimes(1)
  })

  it('explains a lapsed hold as its own outcome and offers a way back', async () => {
    const user = userEvent.setup()
    mockedCreate.mockRejectedValue(buildConflictError())
    renderDetails()

    await fillValidDetails(user)
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    expect(await screen.findByText('השמירה על השעה הסתיימה')).toBeInTheDocument()
    expect(mockedToastError).toHaveBeenCalledTimes(1)
    // The form is gone: filling it in again could not possibly work.
    expect(screen.queryByRole('button', { name: SUBMIT_LABEL })).not.toBeInTheDocument()
  })

  it('sends the Customer back to pick another time after a lapsed hold', async () => {
    const user = userEvent.setup()
    mockedCreate.mockRejectedValue(buildConflictError())
    renderDetails()

    await fillValidDetails(user)
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    await user.click(await screen.findByRole('button', { name: 'בחירת שעה אחרת' }))

    expect(await screen.findByRole('heading', { level: 1, name: /הזמנת תור/ })).toBeInTheDocument()
  })

  it('keeps the Customer on the form when the failure says nothing about the hold', async () => {
    const user = userEvent.setup()
    mockedCreate.mockRejectedValue(new Error('Network Error'))
    renderDetails()

    await fillValidDetails(user)
    await user.click(screen.getByRole('button', { name: SUBMIT_LABEL }))

    await waitFor(() => expect(mockedToastError).toHaveBeenCalledTimes(1))
    // A network failure is not proof the hold lapsed, so the form stays usable.
    expect(screen.getByRole('button', { name: SUBMIT_LABEL })).toBeEnabled()
    expect(screen.queryByText('השמירה על השעה הסתיימה')).not.toBeInTheDocument()
  })
})

describe('the hold countdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows how long is left, in words and numerals', () => {
    renderDetails(5 * 60 * 1000)

    expect(screen.getByText(/השעה שמורה עבורכם לעוד 5:00/)).toBeInTheDocument()
  })

  it('counts down as the Customer fills the form in', () => {
    renderDetails(5 * 60 * 1000)

    act(() => {
      vi.advanceTimersByTime(10_000)
    })

    expect(screen.getByText(/4:50/)).toBeInTheDocument()
  })

  it('warns out loud in the last minute rather than only changing colour', () => {
    renderDetails(30 * 1000)

    expect(screen.getByText('נותרה פחות מדקה להשלמת ההזמנה של שעה זו.')).toBeInTheDocument()
  })

  it('closes the form and explains once the hold runs out', () => {
    renderDetails(2 * 1000)

    act(() => {
      vi.advanceTimersByTime(5_000)
    })

    expect(screen.getByText('השמירה על השעה הסתיימה')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: SUBMIT_LABEL })).not.toBeInTheDocument()
  })

  it('stays quiet when the server gave no deadline, rather than inventing an expiry', () => {
    useStore.setState({
      heldSlot: buildHeldTimeSlot(0, { id: 'slot-1', serviceId: 'svc-1', holdExpiresAt: undefined }),
    })

    render(
      <MemoryRouter initialEntries={['/book/svc-1/details']}>
        <AppRoutes />
      </MemoryRouter>,
    )

    expect(screen.queryByText('השמירה על השעה הסתיימה')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: SUBMIT_LABEL })).toBeEnabled()
  })
})

describe('Customer Details accessibility', () => {
  it('completes the whole booking with the keyboard alone', async () => {
    const user = userEvent.setup()
    mockedCreate.mockResolvedValue(buildAppointment())
    renderDetails()

    screen.getByLabelText(new RegExp(NAME_LABEL)).focus()
    await user.keyboard('דנה לוי')
    await user.tab()
    await user.keyboard('050-123-4567')
    await user.tab()
    await user.tab()

    expect(screen.getByRole('button', { name: SUBMIT_LABEL })).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'התור שלכם הוזמן' }),
    ).toBeInTheDocument()
  })

  it('marks a required field as required for assistive technology', () => {
    renderDetails()

    expect(screen.getByLabelText(new RegExp(NAME_LABEL))).toHaveAttribute('aria-required', 'true')
    expect(screen.getByLabelText(new RegExp(EMAIL_LABEL))).toHaveAttribute('aria-required', 'false')
  })

  it('says which fields are required in words, not with a bare asterisk', () => {
    renderDetails()

    expect(screen.getAllByText('שדה חובה')).toHaveLength(2)
    expect(screen.getByText('לא חובה')).toBeInTheDocument()
  })
})
