import { AxiosError, AxiosHeaders } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useStore } from '../store'
import { appointmentService } from '../../services/appointment.service'
import { buildAdminAppointment, buildAppointment } from '../../test/factories'

/**
 * The Admin half of the Appointment slice (PRD F9-F11, Screen 7) — kept in its
 * own file from the customer booking flow it shares a slice with, because the
 * two have opposite setups: one starts from a held slot in this browser, the
 * other from a list of every booking in the clinic.
 *
 * The real conflict/not-found predicates are kept unmocked: telling "that
 * booking already moved on" apart from "the gateway is down" is precisely the
 * behaviour under test.
 */
vi.mock('../../services/appointment.service', async () => {
  const actual =
    await vi.importActual<typeof import('../../services/appointment.service')>(
      '../../services/appointment.service',
    )

  return {
    ...actual,
    appointmentService: {
      create: vi.fn(),
      getAdminList: vi.fn(),
      confirm: vi.fn(),
      cancel: vi.fn(),
    },
  }
})

const mockedGetAdminList = vi.mocked(appointmentService.getAdminList)
const mockedConfirm = vi.mocked(appointmentService.confirm)
const mockedCancel = vi.mocked(appointmentService.cancel)

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

beforeEach(() => {
  vi.clearAllMocks()
  useStore.setState({
    adminAppointments: [],
    isLoadingAdminAppointments: false,
    hasAdminAppointmentsError: false,
    appointmentFilter: {},
    isSavingAppointment: false,
  })
})

describe('appointmentSlice.loadAdminAppointments', () => {
  it('stores the appointments the service returns', async () => {
    mockedGetAdminList.mockResolvedValue([buildAdminAppointment(), buildAdminAppointment()])

    await useStore.getState().loadAdminAppointments()

    expect(useStore.getState().adminAppointments).toHaveLength(2)
  })

  it('remembers the filter it loaded with so a refresh can reuse it', async () => {
    mockedGetAdminList.mockResolvedValue([])

    await useStore.getState().loadAdminAppointments({ date: '2026-08-18', status: 'pending' })

    expect(useStore.getState().appointmentFilter).toEqual({
      date: '2026-08-18',
      status: 'pending',
    })
  })

  it('reloads with the remembered filter when called with no argument', async () => {
    mockedGetAdminList.mockResolvedValue([])
    await useStore.getState().loadAdminAppointments({ status: 'confirmed' })
    mockedGetAdminList.mockClear()

    await useStore.getState().loadAdminAppointments()

    expect(mockedGetAdminList).toHaveBeenCalledWith({ status: 'confirmed' })
  })

  it('orders the list by when the appointment actually happens', async () => {
    mockedGetAdminList.mockResolvedValue([
      buildAdminAppointment({
        id: 'later',
        timeSlot: { date: '2026-08-19', startTime: '09:00', endTime: '10:00' },
      }),
      buildAdminAppointment({
        id: 'sooner',
        timeSlot: { date: '2026-08-18', startTime: '09:00', endTime: '10:00' },
      }),
      buildAdminAppointment({
        id: 'same-day-later',
        timeSlot: { date: '2026-08-18', startTime: '14:00', endTime: '15:00' },
      }),
    ])

    await useStore.getState().loadAdminAppointments()

    expect(useStore.getState().adminAppointments.map((row) => row.id)).toEqual([
      'sooner',
      'same-day-later',
      'later',
    ])
  })

  it('sorts a booking whose TimeSlot is gone to the end, not the top', async () => {
    mockedGetAdminList.mockResolvedValue([
      buildAdminAppointment({ id: 'undated', timeSlot: undefined }),
      buildAdminAppointment({
        id: 'dated',
        timeSlot: { date: '2026-08-18', startTime: '09:00', endTime: '10:00' },
      }),
    ])

    await useStore.getState().loadAdminAppointments()

    expect(useStore.getState().adminAppointments.map((row) => row.id)).toEqual([
      'dated',
      'undated',
    ])
  })

  it('flags the error and clears the loading flag when the fetch fails', async () => {
    mockedGetAdminList.mockRejectedValue(buildErrorWithStatus(500))

    await expect(useStore.getState().loadAdminAppointments()).rejects.toThrow()

    expect(useStore.getState().isLoadingAdminAppointments).toBe(false)
    expect(useStore.getState().hasAdminAppointmentsError).toBe(true)
    expect(useStore.getState().adminAppointments).toEqual([])
  })

  it('clears a previous error once a retry succeeds', async () => {
    mockedGetAdminList.mockRejectedValueOnce(buildErrorWithStatus(500))
    await expect(useStore.getState().loadAdminAppointments()).rejects.toThrow()

    mockedGetAdminList.mockResolvedValue([buildAdminAppointment()])
    await useStore.getState().loadAdminAppointments()

    expect(useStore.getState().hasAdminAppointmentsError).toBe(false)
    expect(useStore.getState().adminAppointments).toHaveLength(1)
  })
})

describe('appointmentSlice.confirmAppointment', () => {
  it('replaces the row with the record the server returned', async () => {
    const pending = buildAdminAppointment({ id: 'appointment-7', status: 'pending' })
    useStore.setState({ adminAppointments: [pending] })
    mockedConfirm.mockResolvedValue({ ...pending, status: 'confirmed' })

    const outcome = await useStore.getState().confirmAppointment('appointment-7')

    expect(outcome).toBe('updated')
    expect(useStore.getState().adminAppointments[0].status).toBe('confirmed')
  })

  it('keeps the joined display fields a bare PATCH response leaves out', async () => {
    const pending = buildAdminAppointment({ id: 'appointment-7', status: 'pending' })
    useStore.setState({ adminAppointments: [pending] })
    // The PATCH routes return the Appointment and are not obliged to re-send the
    // joined Service/TimeSlot the list was rendered from — confirming a row must
    // not blank out its own service name.
    mockedConfirm.mockResolvedValue(buildAppointment({ id: 'appointment-7', status: 'confirmed' }))

    await useStore.getState().confirmAppointment('appointment-7')

    const [row] = useStore.getState().adminAppointments
    expect(row.status).toBe('confirmed')
    expect(row.service?.name).toBe('Full groom')
    expect(row.timeSlot?.startTime).toBe('09:00')
  })

  it('reports a conflict when the booking had already moved on', async () => {
    mockedConfirm.mockRejectedValue(buildErrorWithStatus(409))

    expect(await useStore.getState().confirmAppointment('appointment-7')).toBe('conflict')
  })

  it('reports a missing record when the booking is gone', async () => {
    mockedConfirm.mockRejectedValue(buildErrorWithStatus(404))

    expect(await useStore.getState().confirmAppointment('appointment-7')).toBe('not-found')
  })

  it('reports a plain error for anything else', async () => {
    mockedConfirm.mockRejectedValue(buildErrorWithStatus(500))

    expect(await useStore.getState().confirmAppointment('appointment-7')).toBe('error')
  })

  it('refuses to act without an id', async () => {
    expect(await useStore.getState().confirmAppointment('')).toBe('error')
    expect(mockedConfirm).not.toHaveBeenCalled()
  })

  it('clears the saving flag whatever the outcome', async () => {
    mockedConfirm.mockRejectedValue(buildErrorWithStatus(500))

    await useStore.getState().confirmAppointment('appointment-7')

    expect(useStore.getState().isSavingAppointment).toBe(false)
  })

  it('refuses a second transition while the first is still in flight', async () => {
    // Two presses racing the server for the same transition means the loser
    // takes a 409; there is no reason to make it fight that battle.
    useStore.setState({ isSavingAppointment: true })

    expect(await useStore.getState().confirmAppointment('appointment-7')).toBe('error')
    expect(mockedConfirm).not.toHaveBeenCalled()
  })
})

describe('appointmentSlice.cancelAppointment', () => {
  it('flips the row to cancelled using the server record', async () => {
    const confirmed = buildAdminAppointment({ id: 'appointment-7', status: 'confirmed' })
    useStore.setState({ adminAppointments: [confirmed] })
    mockedCancel.mockResolvedValue({ ...confirmed, status: 'cancelled' })

    const outcome = await useStore.getState().cancelAppointment('appointment-7')

    expect(outcome).toBe('updated')
    expect(useStore.getState().adminAppointments[0].status).toBe('cancelled')
  })

  it('cancels a pending booking too, not only a confirmed one', async () => {
    const pending = buildAdminAppointment({ id: 'appointment-7', status: 'pending' })
    useStore.setState({ adminAppointments: [pending] })
    mockedCancel.mockResolvedValue({ ...pending, status: 'cancelled' })

    expect(await useStore.getState().cancelAppointment('appointment-7')).toBe('updated')
  })

  it('reports a conflict on an already-cancelled booking', async () => {
    mockedCancel.mockRejectedValue(buildErrorWithStatus(409))

    expect(await useStore.getState().cancelAppointment('appointment-7')).toBe('conflict')
  })

  it('leaves the list untouched when the cancel fails', async () => {
    const confirmed = buildAdminAppointment({ id: 'appointment-7', status: 'confirmed' })
    useStore.setState({ adminAppointments: [confirmed] })
    mockedCancel.mockRejectedValue(buildErrorWithStatus(500))

    await useStore.getState().cancelAppointment('appointment-7')

    expect(useStore.getState().adminAppointments[0].status).toBe('confirmed')
  })

  it('refuses a second cancel while the first is still in flight', async () => {
    useStore.setState({ isSavingAppointment: true })

    expect(await useStore.getState().cancelAppointment('appointment-7')).toBe('error')
    expect(mockedCancel).not.toHaveBeenCalled()
  })
})
