import { AxiosError, AxiosHeaders } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useStore } from '../store'
import { appointmentService } from '../../services/appointment.service'
import { buildAppointment, buildHeldTimeSlot } from '../../test/factories'
import type { CustomerDetails } from '../../types/appointment.types'

vi.mock('../../services/appointment.service', async () => {
  // The real conflict predicate is kept: what counts as "the hold is gone" is
  // exactly the behaviour under test here, so mocking it would test nothing.
  const actual =
    await vi.importActual<typeof import('../../services/appointment.service')>(
      '../../services/appointment.service',
    )

  return { ...actual, appointmentService: { create: vi.fn() } }
})

const mockedCreate = vi.mocked(appointmentService.create)

const details: CustomerDetails = {
  customerName: 'Dana Levi',
  customerPhone: '050-123-4567',
  customerEmail: '',
}

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

describe('appointmentSlice.createAppointment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStore.setState({
      heldSlot: buildHeldTimeSlot(),
      appointment: null,
      isCreatingAppointment: false,
      hasHoldExpired: false,
    })
  })

  it('books the held slot and stores the created Appointment', async () => {
    const appointment = buildAppointment()
    mockedCreate.mockResolvedValue(appointment)
    const slot = useStore.getState().heldSlot

    const outcome = await useStore.getState().createAppointment(details)

    expect(outcome).toBe('created')
    expect(mockedCreate).toHaveBeenCalledWith(slot?.serviceId, slot?.id, details)
    expect(useStore.getState().appointment).toEqual(appointment)
  })

  it('marks the slot booked rather than leaving it claiming to be held', async () => {
    mockedCreate.mockResolvedValue(buildAppointment())

    await useStore.getState().createAppointment(details)

    expect(useStore.getState().heldSlot?.status).toBe('booked')
  })

  it('reports a lapsed hold as a conflict, not as a failure', async () => {
    mockedCreate.mockRejectedValue(buildConflictError())

    const outcome = await useStore.getState().createAppointment(details)

    expect(outcome).toBe('conflict')
    expect(useStore.getState().hasHoldExpired).toBe(true)
    expect(useStore.getState().appointment).toBeNull()
  })

  it('does not send the Customer back to re-pick after a mere network failure', async () => {
    mockedCreate.mockRejectedValue(new Error('Network Error'))

    const outcome = await useStore.getState().createAppointment(details)

    expect(outcome).toBe('error')
    // Nothing here proves the hold is gone, so it is left standing.
    expect(useStore.getState().hasHoldExpired).toBe(false)
  })

  it('refuses to book when no slot is held', async () => {
    useStore.setState({ heldSlot: null })

    const outcome = await useStore.getState().createAppointment(details)

    expect(outcome).toBe('error')
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  it('blocks a second submit while the first is still in flight', async () => {
    mockedCreate.mockImplementation(() => new Promise(() => {}))

    void useStore.getState().createAppointment(details)
    await Promise.resolve()

    const secondOutcome = await useStore.getState().createAppointment(details)

    expect(secondOutcome).toBe('error')
    expect(mockedCreate).toHaveBeenCalledTimes(1)
  })

  it('flags the request as in flight and clears the flag when it settles', async () => {
    mockedCreate.mockResolvedValue(buildAppointment())

    const pending = useStore.getState().createAppointment(details)
    expect(useStore.getState().isCreatingAppointment).toBe(true)

    await pending
    expect(useStore.getState().isCreatingAppointment).toBe(false)
  })

  it('clears the in-flight flag even when the request fails', async () => {
    mockedCreate.mockRejectedValue(new Error('Network Error'))

    await useStore.getState().createAppointment(details)

    expect(useStore.getState().isCreatingAppointment).toBe(false)
  })
})

describe('appointmentSlice.expireHold', () => {
  beforeEach(() => {
    useStore.setState({ hasHoldExpired: false })
  })

  it('marks the hold gone when the countdown runs out', () => {
    useStore.getState().expireHold()

    expect(useStore.getState().hasHoldExpired).toBe(true)
  })

  it('is idempotent, so a ticking timer cannot re-set it every second', () => {
    useStore.getState().expireHold()
    useStore.getState().expireHold()

    expect(useStore.getState().hasHoldExpired).toBe(true)
  })
})

describe('appointmentSlice.resetAppointmentFlow', () => {
  it('clears a previous booking so it cannot greet the next Customer', () => {
    useStore.setState({ appointment: buildAppointment(), hasHoldExpired: true })

    useStore.getState().resetAppointmentFlow()

    expect(useStore.getState().appointment).toBeNull()
    expect(useStore.getState().hasHoldExpired).toBe(false)
  })
})
