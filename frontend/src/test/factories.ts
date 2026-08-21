import type {
  AdminAppointment,
  Appointment,
  AppointmentReceipt,
} from '../types/appointment.types'
import type { LoginResponse, RegisterAdminResponse } from '../types/auth.types'
import type { Service } from '../types/service.types'
import type { TimeSlot } from '../types/timeSlot.types'

/**
 * A successful `POST /api/auth/login` body. The token is an obvious stand-in,
 * never a real or realistic JWT — the frontend never inspects its contents, and
 * test data must not carry anything credential-shaped (.rule/testing-rules.md).
 */
export function buildLoginResponse(overrides: Partial<LoginResponse> = {}): LoginResponse {
  return {
    token: 'test-token',
    admin: { id: 'admin-1', email: 'admin@example.com' },
    ...overrides,
  }
}

/**
 * A successful `POST /api/auth/register` body (PRD F12). Carries the created
 * account's public fields and nothing else — no password, no hash, and no
 * token, since creating an account for someone else must not issue a session.
 */
export function buildRegisterResponse(
  overrides: Partial<RegisterAdminResponse> = {},
): RegisterAdminResponse {
  return {
    admin: { id: 'admin-2', name: 'Dana Levi', email: 'dana@example.com' },
    ...overrides,
  }
}

let sequence = 0

/** Minimal Service builder — override only the fields a test actually cares about. */
export function buildService(overrides: Partial<Service> = {}): Service {
  sequence += 1

  return {
    id: `service-${sequence}`,
    name: `Service ${sequence}`,
    durationMinutes: 60,
    price: 150,
    isActive: true,
    ...overrides,
  }
}

let slotSequence = 0

/**
 * Minimal TimeSlot builder. Defaults to an `open` slot, since that is the only
 * status the public picker ever renders — a test that cares about `held`/
 * `booked` is testing a filter and should say so by overriding it explicitly.
 */
export function buildTimeSlot(overrides: Partial<TimeSlot> = {}): TimeSlot {
  slotSequence += 1

  // Walks 09:00, 10:00, 11:00… so slots in one test never share a time label.
  const hour = String(8 + (slotSequence % 12)).padStart(2, '0')

  return {
    id: `slot-${slotSequence}`,
    serviceId: 'service-1',
    date: '2026-08-18',
    startTime: `${hour}:00`,
    endTime: `${hour}:45`,
    status: 'open',
    ...overrides,
  }
}

/**
 * A slot the server has just moved to `held`, with a hold deadline the given
 * number of milliseconds away. The deadline is computed from the current clock
 * so a test that freezes time gets a deterministic countdown.
 */
export function buildHeldTimeSlot(remainingMs = 5 * 60 * 1000, overrides: Partial<TimeSlot> = {}) {
  return buildTimeSlot({
    status: 'held',
    holdExpiresAt: new Date(Date.now() + remainingMs).toISOString(),
    ...overrides,
  })
}

let appointmentSequence = 0

/**
 * Minimal Appointment builder. Defaults to `pending`, since that is the only
 * status Screen 3 can ever produce — a test that cares about `confirmed`/
 * `cancelled` is testing the Admin flow and should say so by overriding it.
 */
export function buildAppointment(overrides: Partial<Appointment> = {}): Appointment {
  appointmentSequence += 1

  return {
    id: `appointment-${appointmentSequence}`,
    serviceId: 'service-1',
    timeSlotId: 'slot-1',
    customerName: 'Dana Levi',
    customerPhone: '050-123-4567',
    status: 'pending',
    ...overrides,
  }
}

/**
 * One row of the Admin's list (Screen 7), as `GET /api/appointments` returns it:
 * an Appointment plus the joined Service and TimeSlot display fields.
 *
 * The nested parts are spread *before* the overrides so a test can replace or
 * drop either one — `buildAdminAppointment({ timeSlot: undefined })` is how the
 * "record no longer on file" row is expressed, and it has to actually win.
 */
export function buildAdminAppointment(
  overrides: Partial<AdminAppointment> = {},
): AdminAppointment {
  return {
    ...buildAppointment(),
    service: { name: 'Full groom', durationMinutes: 90, price: 220 },
    timeSlot: { date: '2026-08-18', startTime: '09:00', endTime: '10:30' },
    ...overrides,
  }
}

/**
 * An Appointment as `GET /api/appointments/{id}` returns it for Screen 4:
 * enriched with the Service and TimeSlot facts a receipt has to show.
 */
export function buildAppointmentReceipt(
  overrides: Partial<AppointmentReceipt> = {},
): AppointmentReceipt {
  return {
    ...buildAppointment(),
    service: { name: 'Full groom', durationMinutes: 90, price: 220 },
    timeSlot: { date: '2026-08-18', startTime: '09:00', endTime: '10:30' },
    ...overrides,
  }
}
