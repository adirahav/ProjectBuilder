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
