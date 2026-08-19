// Mirrors the TimeSlot schema in docs/api-contract/api-contract.booking-service.yaml.
// The client-facing identifier is always `id` (a uuid string) — Mongo's `_id` is
// an internal backend detail and must never appear here (.rule/naming-rules.md).

/**
 * The three states a TimeSlot can be in. Spelled exactly as the API and the DB
 * spell them (.rule/naming-rules.md) — no alternate casing, no synonyms.
 *
 * `open`   — bookable by anyone.
 * `held`   — transiently claimed by a Customer who is mid-checkout; the hold
 *            expires server-side, at which point the slot is `open` again.
 * `booked` — finalized into an Appointment.
 */
export type TimeSlotStatus = 'open' | 'held' | 'booked'

export interface TimeSlot {
  id: string
  serviceId: string
  /** Calendar day in `YYYY-MM-DD`, in the clinic's local timezone. */
  date: string
  /** Wall-clock start in 24h `HH:mm`, e.g. `09:30`. */
  startTime: string
  /** Wall-clock end in 24h `HH:mm`. */
  endTime: string
  status: TimeSlotStatus
  /**
   * When this hold lapses, as an ISO-8601 instant. Present only on a slot the
   * server just moved to `held`, and absent everywhere else.
   *
   * Unlike the wall-clock `startTime`/`endTime`, this one *is* a real instant:
   * it is a deadline, not a time of day, so it must survive being compared
   * against the Customer's clock. It exists purely so Screen 3 can show how
   * long is left rather than letting the form expire silently under the
   * Customer — the server's 409 on submit stays the authority on whether the
   * hold actually still stands.
   */
  holdExpiresAt?: string
}

/**
 * The outcome of attempting to hold a slot. A conflict is a *normal* result
 * here, not an exception: two Customers racing for the last slot is expected
 * behaviour (PRD AC-2), so it is modelled as a value the caller must handle
 * rather than an error it might forget to catch.
 */
export type HoldOutcome = 'held' | 'conflict' | 'error'
