import { AxiosError, AxiosHeaders } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  appointmentService,
  isAppointmentConflictError,
  isAppointmentNotFoundError,
  toCreatePayload,
} from './appointment.service'
import { httpService } from './http.service'
import { buildAppointment, buildAppointmentReceipt } from '../test/factories'
import type { CustomerDetails } from '../types/appointment.types'

vi.mock('./http.service', () => ({
  httpService: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

const mockedPost = vi.mocked(httpService.post)

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
