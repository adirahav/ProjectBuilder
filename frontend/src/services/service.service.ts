import { httpService } from './http.service'
import type { Service } from '../types/service.types'

// Endpoints mirror docs/api-contract/api-contract.booking-service.yaml.
const BASE_URL = '/api/services'

// Public, unauthenticated (PRD F1). booking-service filters to isActive: true
// server-side; the defensive filter below only guards against a backend that
// starts returning inactive records, so a deactivated Service can never leak
// onto the customer-facing list (PRD AC-4).
async function getList(): Promise<Service[]> {
  const services = await httpService.get<Service[]>(BASE_URL)

  if (!Array.isArray(services)) {
    console.log('[SERVICE] unexpected services payload shape')
    return []
  }

  return services.filter((service) => service.isActive !== false)
}

export const serviceService = {
  getList,
}
