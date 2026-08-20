import { AxiosError, AxiosHeaders } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  appointmentService,
  isAppointmentConflictError,
  isAppointmentNotFoundError,
  toAdminListParams,
  toCreatePayload,
} from './appointment.service'
import { gatewayHttpService, httpService } from './http.service'
import {
  buildAdminAppointment,
  buildAppointment,
  buildAppointmentReceipt,
} from '../test/factories'
import type { CustomerDetails } from '../types/appointment.types'

vi.mock('./http.service', () => ({
  httpService: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  gatewayHttpService: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

const mockedPost = vi.mocked(httpService.post)
const mockedGatewayGet = vi.mocked(gatewayHttpService.get)
const mockedGatewayPatch = vi.mocked(gatewayHttpService.patch)

const details: CustomerDetails = {
  customerName: 'Dana Levi',
  customerPhone: '050-123-4567',
  customerEmail: 'dana@example.com',
}

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

describe('appointmentService.create', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('posts the booking and returns the created Appointment', async () => {
    const appointment = buildAppointment()
    mockedPost.mockResolvedValue(appointment)

    await expect(appointmentService.create('service-1', 'slot-1', details)).resolves.toEqual(
      appointment,
    )

    expect(mockedPost).toHaveBeenCalledWith('/api/appointments', {
      slotId: 'slot-1',
      serviceId: 'service-1',
      customerName: 'Dana Levi',
      customerPhone: '050-123-4567',
      customerEmail: 'dana@example.com',
    })
  })

  it('omits the email entirely rather than sending an empty string', async () => {
    mockedPost.mockResolvedValue(buildAppointment())

    await appointmentService.create('service-1', 'slot-1', { ...details, customerEmail: '' })

    expect(mockedPost.mock.calls[0][1]).not.toHaveProperty('customerEmail')
  })

  it('trims what the Customer typed before sending it', async () => {
    mockedPost.mockResolvedValue(buildAppointment())

    await appointmentService.create('service-1', 'slot-1', {
      customerName: '  Dana Levi ',
      customerPhone: ' 050-123-4567 ',
      customerEmail: ' dana@example.com ',
    })

    expect(mockedPost.mock.calls[0][1]).toMatchObject({
      customerName: 'Dana Levi',
      customerPhone: '050-123-4567',
      customerEmail: 'dana@example.com',
    })
  })

  it('refuses to send invalid details instead of letting the server answer 400', async () => {
    await expect(
      appointmentService.create('service-1', 'slot-1', { ...details, customerPhone: '' }),
    ).rejects.toThrow()

    expect(mockedPost).not.toHaveBeenCalled()
  })

  it('refuses to book without a held slot', async () => {
    await expect(appointmentService.create('service-1', '', details)).rejects.toThrow()

    expect(mockedPost).not.toHaveBeenCalled()
  })

  it('propagates a server failure rather than swallowing it', async () => {
    mockedPost.mockRejectedValue(buildErrorWithStatus(500))

    await expect(appointmentService.create('service-1', 'slot-1', details)).rejects.toBeInstanceOf(
      AxiosError,
    )
  })
})

describe('isAppointmentConflictError', () => {
  it('recognises the 409 that means the hold is gone', () => {
    expect(isAppointmentConflictError(buildErrorWithStatus(409))).toBe(true)
  })

  it.each([400, 404, 500, 503])('does not treat %i as a lapsed hold', (status) => {
    expect(isAppointmentConflictError(buildErrorWithStatus(status))).toBe(false)
  })

  it('does not treat a plain network failure as a lapsed hold', () => {
    expect(isAppointmentConflictError(new Error('Network Error'))).toBe(false)
  })
})

describe('appointmentService.getReceipt', () => {
  const mockedGet = vi.mocked(httpService.get)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads one Appointment back by its id', async () => {
    const receipt = buildAppointmentReceipt({ id: 'appointment-7' })
    mockedGet.mockResolvedValue(receipt)

    await expect(appointmentService.getReceipt('appointment-7')).resolves.toEqual(receipt)
    expect(mockedGet).toHaveBeenCalledWith('/api/appointments/appointment-7')
  })

  it('escapes the id rather than pasting it into the path as typed', async () => {
    mockedGet.mockResolvedValue(buildAppointmentReceipt())

    await appointmentService.getReceipt('a/../../secret')

    expect(mockedGet).toHaveBeenCalledWith('/api/appointments/a%2F..%2F..%2Fsecret')
  })

  it('refuses to fetch without an id instead of calling a bare collection URL', async () => {
    await expect(appointmentService.getReceipt('')).rejects.toThrow()

    expect(mockedGet).not.toHaveBeenCalled()
  })

  it('lets a missing booking propagate for the page to explain', async () => {
    mockedGet.mockRejectedValue(buildErrorWithStatus(404))

    await expect(appointmentService.getReceipt('gone')).rejects.toBeInstanceOf(AxiosError)
  })
})

describe('isAppointmentNotFoundError', () => {
  it('recognises the 404 that means no such booking', () => {
    expect(isAppointmentNotFoundError(buildErrorWithStatus(404))).toBe(true)
  })

  it.each([400, 409, 500, 503])('does not treat %i as a missing booking', (status) => {
    expect(isAppointmentNotFoundError(buildErrorWithStatus(status))).toBe(false)
  })

  it('does not treat a plain network failure as a missing booking', () => {
    expect(isAppointmentNotFoundError(new Error('Network Error'))).toBe(false)
  })
})

describe('toCreatePayload', () => {
  it('keeps the slot as the identifier the server resolves everything else from', () => {
    expect(toCreatePayload('service-1', 'slot-9', details)).toMatchObject({
      slotId: 'slot-9',
      serviceId: 'service-1',
    })
  })
})

describe('toAdminListParams', () => {
  it('sends nothing at all when the Admin has not narrowed the list', () => {
    expect(toAdminListParams({})).toEqual({})
    expect(toAdminListParams()).toEqual({})
  })

  it('forwards a well-formed date and status', () => {
    expect(toAdminListParams({ date: '2026-08-18', status: 'pending' })).toEqual({
      date: '2026-08-18',
      status: 'pending',
    })
  })

  it('omits a malformed date rather than sending one the server cannot parse', () => {
    // A wider list than asked for is the honest failure here; a 400 and a blank
    // screen is not.
    expect(toAdminListParams({ date: '18/08/2026' })).toEqual({})
  })

  it('omits a status that is not one the API recognizes', () => {
    expect(toAdminListParams({ status: 'archived' as never })).toEqual({})
  })

  it('keeps the valid half of a half-valid filter', () => {
    expect(toAdminListParams({ date: 'nonsense', status: 'confirmed' })).toEqual({
      status: 'confirmed',
    })
  })
})

describe('appointmentService.getAdminList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('asks api-gateway, never booking-service directly', async () => {
    mockedGatewayGet.mockResolvedValue([])

    await appointmentService.getAdminList()

    // The list aggregates customer names and phone numbers across the whole
    // clinic; only the JWT-verifying origin may serve it.
    expect(mockedGatewayGet).toHaveBeenCalledWith('/api/appointments', {})
    expect(httpService.get).not.toHaveBeenCalled()
  })

  it('passes the filter through as query parameters', async () => {
    mockedGatewayGet.mockResolvedValue([])

    await appointmentService.getAdminList({ date: '2026-08-18', status: 'pending' })

    expect(mockedGatewayGet).toHaveBeenCalledWith('/api/appointments', {
      date: '2026-08-18',
      status: 'pending',
    })
  })

  it('returns the appointments the API sends back', async () => {
    const appointments = [buildAdminAppointment(), buildAdminAppointment()]
    mockedGatewayGet.mockResolvedValue(appointments)

    expect(await appointmentService.getAdminList()).toEqual(appointments)
  })

  it('treats an empty diary as an empty list, not a failure', async () => {
    mockedGatewayGet.mockResolvedValue([])

    expect(await appointmentService.getAdminList()).toEqual([])
  })

  it('degrades to an empty list when the body is not a list at all', async () => {
    // An error envelope where an array was promised is a backend fault worth
    // logging — but it must not hand the page something it will crash on.
    mockedGatewayGet.mockResolvedValue({ error: 'Unauthorized' } as never)

    expect(await appointmentService.getAdminList()).toEqual([])
  })

  it('lets a transport failure reach the caller', async () => {
    mockedGatewayGet.mockRejectedValue(buildErrorWithStatus(500))

    await expect(appointmentService.getAdminList()).rejects.toThrow()
  })
})

describe('appointmentService.confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('patches the confirm route for that appointment through the gateway', async () => {
    const appointment = buildAdminAppointment({ status: 'confirmed' })
    mockedGatewayPatch.mockResolvedValue(appointment)

    await appointmentService.confirm('appointment-7')

    expect(mockedGatewayPatch).toHaveBeenCalledWith('/api/appointments/appointment-7/confirm')
  })

  it('returns the server record rather than a locally-guessed status', async () => {
    const appointment = buildAdminAppointment({ status: 'confirmed' })
    mockedGatewayPatch.mockResolvedValue(appointment)

    expect(await appointmentService.confirm('appointment-7')).toEqual(appointment)
  })

  it('escapes an id that would otherwise change which route is called', async () => {
    mockedGatewayPatch.mockResolvedValue(buildAdminAppointment())

    await appointmentService.confirm('a/../b')

    expect(mockedGatewayPatch).toHaveBeenCalledWith('/api/appointments/a%2F..%2Fb/confirm')
  })

  it('refuses to send a request with no appointment id', async () => {
    await expect(appointmentService.confirm('')).rejects.toThrow('Missing appointmentId')
    expect(mockedGatewayPatch).not.toHaveBeenCalled()
  })

  it('surfaces a 409 as a conflict the caller can recognize', async () => {
    const conflict = buildErrorWithStatus(409)
    mockedGatewayPatch.mockRejectedValue(conflict)

    await expect(appointmentService.confirm('appointment-7')).rejects.toBe(conflict)
    expect(isAppointmentConflictError(conflict)).toBe(true)
  })

  it('surfaces a 404 as a missing record the caller can recognize', async () => {
    const missing = buildErrorWithStatus(404)
    mockedGatewayPatch.mockRejectedValue(missing)

    await expect(appointmentService.confirm('appointment-7')).rejects.toBe(missing)
    expect(isAppointmentNotFoundError(missing)).toBe(true)
  })
})

describe('appointmentService.cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('patches the cancel route for that appointment through the gateway', async () => {
    mockedGatewayPatch.mockResolvedValue(buildAdminAppointment({ status: 'cancelled' }))

    await appointmentService.cancel('appointment-7')

    expect(mockedGatewayPatch).toHaveBeenCalledWith('/api/appointments/appointment-7/cancel')
  })

  it('makes exactly one request, leaving the TimeSlot release to the server', async () => {
    mockedGatewayPatch.mockResolvedValue(buildAdminAppointment({ status: 'cancelled' }))

    await appointmentService.cancel('appointment-7')

    // A client that cancelled the booking and then failed its second call would
    // strand a time nobody can ever book (plan 013, Open Question 3).
    expect(mockedGatewayPatch).toHaveBeenCalledTimes(1)
  })

  it('returns the cancelled record the server sends back', async () => {
    const cancelled = buildAdminAppointment({ status: 'cancelled' })
    mockedGatewayPatch.mockResolvedValue(cancelled)

    expect(await appointmentService.cancel('appointment-7')).toEqual(cancelled)
  })

  it('refuses to send a request with no appointment id', async () => {
    await expect(appointmentService.cancel('')).rejects.toThrow('Missing appointmentId')
    expect(mockedGatewayPatch).not.toHaveBeenCalled()
  })

  it('surfaces a 409 when the booking had already moved on', async () => {
    const conflict = buildErrorWithStatus(409)
    mockedGatewayPatch.mockRejectedValue(conflict)

    await expect(appointmentService.cancel('appointment-7')).rejects.toBe(conflict)
    expect(isAppointmentConflictError(conflict)).toBe(true)
  })
})
