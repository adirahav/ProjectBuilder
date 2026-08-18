import type { Service } from '../types/service.types'

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
