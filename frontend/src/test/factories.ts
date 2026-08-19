import type { Appointment } from '../types/appointment.types'
import type { Service } from '../types/service.types'
import type { TimeSlot } from '../types/timeSlot.types'

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
