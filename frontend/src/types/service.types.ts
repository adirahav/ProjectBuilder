// Mirrors the Service schema in docs/api-contract/api-contract.booking-service.yaml.
// The client-facing identifier is always `id` (a uuid string) — Mongo's `_id` is
// an internal backend detail and must never appear here (.rule/naming-rules.md).
export interface Service {
  id: string
  name: string
  durationMinutes: number
  price: number
  isActive: boolean
}
