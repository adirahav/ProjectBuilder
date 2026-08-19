import { AxiosError, AxiosHeaders } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { AppRoutes } from '../App'
import { appointmentService } from '../services/appointment.service'
import { serviceService } from '../services/service.service'
import { timeSlotService } from '../services/timeSlot.service'
import { useStore } from '../store/store'
import {
  buildAppointment,
  buildAppointmentReceipt,
  buildService,
  buildTimeSlot,
} from '../test/factories'

vi.mock('../services/appointment.service', async () => {
  // The real 404/409 predicates are kept: telling "no such booking" apart from
  // "the lookup failed" is exactly what these tests exercise.
  const actual =
    await vi.importActual<typeof import('../services/appointment.service')>(
      '../services/appointment.service',
    )

  return { ...actual, appointmentService: { create: vi.fn(), getReceipt: vi.fn() } }
})

vi.mock('../services/service.service', () => ({
  serviceService: { getList: vi.fn() },
}))

vi.mock('../services/timeSlot.service', async () => {
  const actual =
    await vi.importActual<typeof import('../services/timeSlot.service')>(
      '../services/timeSlot.service',
    )

  return { ...actual, timeSlotService: { getList: vi.fn(), hold: vi.fn() } }
})

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
  Toaster: () => null,
}))

const { toast } = await import('sonner')
const mockedGetReceipt = vi.mocked(appointmentService.getReceipt)
const mockedCreate = vi.mocked(appointmentService.create)
const mockedToastError = vi.mocked(toast.error)

const TITLE = 'התור שלכם הוזמן'
const NOT_FOUND = 'לא מצאנו את ההזמנה הזו'
const LOAD_FAILED = 'לא הצלחנו לטעון את ההזמנה שלכם'

function buildErrorWithStatus(status: number): AxiosError {
  const error = new AxiosError(`Request failed with status code ${status}`)
  error.response = {
    status,
    statusText: 'Error',
    data: { error: 'Error' },
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  }
  return error
}

function renderConfirmation(path = '/book/svc-1/confirmation/appointment-abc') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

/** Puts the store where the booking flow leaves it: booked, slot and Service in hand. */
function seedJustBooked() {
  const service = buildService({ id: 'svc-1', name: 'תספורת מלאה', durationMinutes: 90, price: 220 })
  const slot = buildTimeSlot({
    id: 'slot-1',
    serviceId: 'svc-1',
    date: '2026-08-18',
    startTime: '09:00',
    endTime: '10:30',
    status: 'booked',
  })
  const appointment = buildAppointment({
    id: 'appointment-abc',
    serviceId: 'svc-1',
    timeSlotId: 'slot-1',
    customerName: 'דנה לוי',
    customerPhone: '050-123-4567',
    customerEmail: 'dana@example.com',
  })

  useStore.setState({ services: [service], heldSlot: slot, appointment })

  return { service, slot, appointment }
}

beforeEach(() => {
  vi.clearAllMocks()
  useStore.setState({ services: [], heldSlot: null, appointment: null })
  vi.mocked(serviceService.getList).mockResolvedValue([])
  vi.mocked(timeSlotService.getList).mockResolvedValue([])
})

describe('the receipt straight after booking', () => {
  it('shows what was booked without asking the server again', async () => {
    seedJustBooked()
    renderConfirmation()

    expect(await screen.findByRole('heading', { level: 1, name: TITLE })).toBeInTheDocument()
    expect(screen.getByText('תספורת מלאה')).toBeInTheDocument()
    // Matched loosely around the dash: RTL normalizes the thin spaces that
    // formatTimeRange puts either side of it down to ordinary whitespace.
    expect(screen.getByText(/09:00\s*–\s*10:30/)).toBeInTheDocument()
    expect(mockedGetReceipt).not.toHaveBeenCalled()
  })

  it('repeats the contact details the Customer entered, so they can check them', () => {
    seedJustBooked()
    renderConfirmation()

    expect(screen.getByText('דנה לוי')).toBeInTheDocument()
    expect(screen.getByText('050-123-4567')).toBeInTheDocument()
    expect(screen.getByText('dana@example.com')).toBeInTheDocument()
  })

  it('states the price and the duration of the treatment booked', () => {
    seedJustBooked()
    renderConfirmation()

    expect(screen.getByText(/220/)).toBeInTheDocument()
    expect(screen.getByText(/1 שע׳ 30 דק׳/)).toBeInTheDocument()
  })

  it('carries the booking reference, which is what identifies it later', () => {
    seedJustBooked()
    renderConfirmation()

    expect(screen.getByText('appointment-abc')).toBeInTheDocument()
  })

  it('shows the booking as awaiting the clinic, never as already confirmed', () => {
    seedJustBooked()
    renderConfirmation()

    expect(screen.getByText('ממתין לאישור')).toBeInTheDocument()
  })

  it('leaves out the email row entirely when the Customer gave none', () => {
    const { appointment } = seedJustBooked()
    useStore.setState({ appointment: { ...appointment, customerEmail: undefined } })
    renderConfirmation()

    expect(screen.queryByText('דוא״ל')).not.toBeInTheDocument()
    expect(screen.getByText('050-123-4567')).toBeInTheDocument()
  })

  it('still shows the booking when the Service list is not in memory', () => {
    const { appointment, slot } = seedJustBooked()
    useStore.setState({ services: [], appointment, heldSlot: slot })
    renderConfirmation()

    // No invented Service name — the facts that survive are still shown.
    expect(screen.queryByText('תספורת מלאה')).not.toBeInTheDocument()
    expect(screen.getByText('appointment-abc')).toBeInTheDocument()
  })

  it('refuses to pass off a different booking as the one in the URL', async () => {
    seedJustBooked()
    mockedGetReceipt.mockResolvedValue(buildAppointmentReceipt({ id: 'appointment-zzz' }))

    renderConfirmation('/book/svc-1/confirmation/appointment-zzz')

    await waitFor(() => expect(mockedGetReceipt).toHaveBeenCalledWith('appointment-zzz'))
  })
})

describe('the receipt after a reload', () => {
  it('re-fetches the booking by the id in the URL when memory is empty', async () => {
    mockedGetReceipt.mockResolvedValue(
      buildAppointmentReceipt({
        id: 'appointment-abc',
        customerName: 'דנה לוי',
        service: { name: 'תספורת מלאה', durationMinutes: 90, price: 220 },
        timeSlot: { date: '2026-08-18', startTime: '09:00', endTime: '10:30' },
      }),
    )

    renderConfirmation()

    expect(await screen.findByText('תספורת מלאה')).toBeInTheDocument()
    expect(screen.getByText('דנה לוי')).toBeInTheDocument()
    expect(mockedGetReceipt).toHaveBeenCalledWith('appointment-abc')
  })

  it('says it is loading rather than flashing a "not found" it has not established', () => {
    mockedGetReceipt.mockImplementation(() => new Promise(() => {}))

    renderConfirmation()

    expect(screen.getByText('טוענים את פרטי ההזמנה…')).toBeInTheDocument()
    expect(screen.queryByText(NOT_FOUND)).not.toBeInTheDocument()
  })

  it('explains a stale or mistyped link instead of showing a blank page', async () => {
    mockedGetReceipt.mockRejectedValue(buildErrorWithStatus(404))

    renderConfirmation('/book/svc-1/confirmation/does-not-exist')

    expect(await screen.findByText(NOT_FOUND)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'חזרה לרשימת השירותים' })).toBeInTheDocument()
  })

  it('does not toast a missing booking — the page already says so', async () => {
    mockedGetReceipt.mockRejectedValue(buildErrorWithStatus(404))

    renderConfirmation('/book/svc-1/confirmation/does-not-exist')

    await screen.findByText(NOT_FOUND)
    expect(mockedToastError).not.toHaveBeenCalled()
  })

  it('has nothing to look up, and says so, when the URL carries no id', async () => {
    renderConfirmation('/book/svc-1/confirmation')

    expect(await screen.findByText(NOT_FOUND)).toBeInTheDocument()
    expect(mockedGetReceipt).not.toHaveBeenCalled()
  })
})

describe('when the lookup itself fails', () => {
  it('offers a retry and reports the failure once', async () => {
    mockedGetReceipt.mockRejectedValue(new Error('Network Error'))

    renderConfirmation()

    expect(await screen.findByText(LOAD_FAILED)).toBeInTheDocument()
    expect(mockedToastError).toHaveBeenCalledTimes(1)
  })

  it('recovers on retry rather than stranding the Customer', async () => {
    const user = userEvent.setup()
    mockedGetReceipt.mockRejectedValueOnce(new Error('Network Error'))
    mockedGetReceipt.mockResolvedValueOnce(
      buildAppointmentReceipt({ id: 'appointment-abc', customerName: 'דנה לוי' }),
    )

    renderConfirmation()

    await user.click(await screen.findByRole('button', { name: 'נסו שוב' }))

    expect(await screen.findByText('דנה לוי')).toBeInTheDocument()
    expect(mockedGetReceipt).toHaveBeenCalledTimes(2)
  })

  it('keeps a failure distinct from a missing booking', async () => {
    mockedGetReceipt.mockRejectedValue(new Error('Network Error'))

    renderConfirmation()

    await screen.findByText(LOAD_FAILED)
    expect(screen.queryByText(NOT_FOUND)).not.toBeInTheDocument()
  })
})

describe('the confirmation page as part of the booking flow', () => {
  it('lands here with the receipt after the details form is submitted', async () => {
    const user = userEvent.setup()
    useStore.setState({
      services: [buildService({ id: 'svc-1', name: 'תספורת מלאה' })],
      heldSlot: buildTimeSlot({
        id: 'slot-1',
        serviceId: 'svc-1',
        startTime: '09:00',
        endTime: '10:30',
        status: 'held',
      }),
    })
    mockedCreate.mockResolvedValue(
      buildAppointment({ id: 'appointment-abc', serviceId: 'svc-1', timeSlotId: 'slot-1' }),
    )

    render(
      <MemoryRouter initialEntries={['/book/svc-1/details']}>
        <AppRoutes />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/שם מלא/), 'דנה לוי')
    await user.type(screen.getByLabelText(/מספר טלפון/), '050-123-4567')
    await user.click(screen.getByRole('button', { name: 'הזמנת התור' }))

    expect(await screen.findByRole('heading', { level: 1, name: TITLE })).toBeInTheDocument()
    expect(screen.getByText('appointment-abc')).toBeInTheDocument()
    // The receipt came from what the flow already had — no extra round-trip.
    expect(mockedGetReceipt).not.toHaveBeenCalled()
  })
})

describe('confirmation accessibility', () => {
  it('announces the outcome in a live region rather than only visually', async () => {
    seedJustBooked()
    renderConfirmation()

    const summary = await screen.findByRole('region', { name: 'סיכום ההזמנה שלכם' })
    expect(summary).toBeInTheDocument()
  })

  it('names the confirmed state in words and not by colour alone', () => {
    seedJustBooked()
    renderConfirmation()

    expect(screen.getByText('שמרו את הדף הזה — הוא האישור שלכם על התור.')).toBeInTheDocument()
    expect(screen.getByText('ממתין לאישור')).toBeInTheDocument()
  })

  it('offers a way onward to book again', () => {
    seedJustBooked()
    renderConfirmation()

    expect(screen.getByRole('link', { name: 'הזמנת תור נוסף' })).toBeInTheDocument()
  })
})
