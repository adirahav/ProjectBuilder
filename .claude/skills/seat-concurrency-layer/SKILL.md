---
name: seat-concurrency-layer
description: Use this skill whenever writing, reviewing, or testing any code that changes the status of a TimeSlot (hold, book, cancel, and any other action competing for the same appointment slot). This is the highest-risk area in this codebase — two customers racing to book the same TimeSlot must never both succeed.
references:
  - @backend-service-layer/SKILL.md
  - @.rule/database-rules.md
  - @.rule/testing-rules.md
  - @agents/security/CLAUDE.md
---

# TimeSlot Concurrency Layer
*Goal:* Guarantee that a `TimeSlot` can never be claimed by two `Appointment`s at once, no matter how close together the requests arrive — without resorting to locks, queues, or anything that would make the booking flow feel slow or unresponsive.

**Why this exists as its own skill, not just a note in `backend-service-layer`:** most bugs are inconvenient. A double-booked `TimeSlot` is the one bug that reaches a real dog owner expecting an appointment that's no longer actually available (or a clinic owner double-booked at the same time). It gets its own skill because it deserves a slower, more deliberate pass than "remember to use `findOneAndUpdate`."

## The Core Guarantee
For any two operations that target the same `TimeSlot` at nearly the same instant, **exactly one must succeed and the other must receive a `409` conflict response.** Never both-succeed (double-booking), never both-fail (a slot stuck in limbo), never a lost update (one action silently overwriting the other with no error).

## Why Read-Then-Write Fails
```typescript
// This looks correct. It is not.
async function holdTimeSlotBROKEN(timeSlotId: string) {
  const slot = await TimeSlot.findById(timeSlotId)   // Request A reads: status = 'available'
                                                        // Request B reads: status = 'available'  ← both see the same state
  if (slot.status !== 'available') {
    throw new ConflictError('TimeSlot is no longer available')
  }
  slot.status = 'held'                                 // Request A writes: status = 'held'
  slot.heldAt = new Date()
  await slot.save()                                    // Request B writes: status = 'held', overwriting A's hold silently
  return slot                                           // Both calls return success. Both customers think they got the slot.
}
```
The failure mode isn't exotic — it's two customers tapping the same visually-"available" time slot within a few milliseconds of each other, which happens constantly the moment a clinic's popular slots fill up.

## The Fix: One Atomic Operation, Not Two
The check and the write must happen as a single database operation the DB itself makes atomic — never two round-trips from the application.

```typescript
// Correct — the database, not the application, decides who wins the race.
// POST /api/timeslots/:id/hold
async function holdTimeSlot(timeSlotId: string) {
  const slot = await TimeSlot.findOneAndUpdate(
    { uuid: timeSlotId, status: 'available' },   // the condition is part of the same atomic operation as the write
    {
      $set: {
        status: 'held',
        heldAt: new Date(),
      },
    },
    { new: true }
  )

  if (!slot) {
    // findOneAndUpdate returned null: the condition { status: 'available' } didn't match
    // at the instant MongoDB evaluated it — someone else got there first.
    throw new ConflictError('TimeSlot is no longer available')
  }

  return slot
}

// POST /api/appointments — commits the booking, moving the slot held → booked
async function bookAppointment(timeSlotId: string, serviceId: string, customerName: string, customerPhone: string) {
  const slot = await TimeSlot.findOneAndUpdate(
    { uuid: timeSlotId, status: 'held' },        // must currently be held (by this booking transaction)
    { $set: { status: 'booked' } },
    { new: true }
  )

  if (!slot) {
    // Someone else's hold expired-and-was-reclaimed, or the slot was never held — reject the booking.
    throw new ConflictError('TimeSlot is no longer available')
  }

  return Appointment.create({
    serviceId,
    timeSlotId: slot._id,
    customerName,
    customerPhone,
    status: 'pending',
  })
}
```
`findOneAndUpdate` (and `updateOne`, `findOneAndReplace`) are atomic **per document** in MongoDB — the filter and the update are evaluated as one indivisible operation. That's the entire mechanism. No manual locking, no `LockService`, no queue needed for the single-slot case.

## Per-Action Rules
| Action | Transition | Atomic filter |
|---|---|---|
| `hold` (`POST /api/timeslots/:id/hold`) | `available → held` | `{ uuid: id, status: 'available' }` |
| `book` (`POST /api/appointments`) | `held → booked` | `{ uuid: timeSlotId, status: 'held' }` |
| `cancel` (`PATCH /api/appointments/:id/cancel`) | `booked → available` | `{ uuid: timeSlotId, status: 'booked' }` (on the `TimeSlot`), paired with `{ uuid: appointmentId, status: { $in: ['pending', 'confirmed'] } }` (on the `Appointment`, set to `cancelled`) |
| hold expiry (system, on timeout) | `held → available` | `{ status: 'held', heldAt: { $lt: <now - HOLD_TIMEOUT> } }` |

Every row above is a single `findOneAndUpdate` — if it returns `null`, the controller returns `409`. There is no case in this table where reading first and writing second is acceptable, regardless of who the caller is. Two customers racing on the same slot, or a customer and an expiring-hold sweep racing each other, are just as real a race as any other pairing.

## The Multi-Document Case: `cancel`
`cancel` (`PATCH /api/appointments/:id/cancel`) is the one action in this system that changes **two** documents at once — the `Appointment`'s `status` and its `TimeSlot`'s `status`. MongoDB's single-document atomicity doesn't cover two documents at once. Two options, in order of preference:

1. **MongoDB transaction** (if the deployment tier/replica-set config supports it): wrap both `findOneAndUpdate` calls in a `session`, and abort the transaction if either update's precondition fails.
   ```typescript
   const session = await mongoose.startSession()
   try {
     await session.withTransaction(async () => {
       const appointment = await Appointment.findOneAndUpdate(
         { uuid: appointmentId, status: { $in: ['pending', 'confirmed'] } },
         { $set: { status: 'cancelled' } },
         { session, new: true }
       )
       if (!appointment) throw new ConflictError('Appointment cannot be cancelled in its current state')

       const slot = await TimeSlot.findOneAndUpdate(
         { _id: appointment.timeSlotId, status: 'booked' },
         { $set: { status: 'available' } },
         { session, new: true }
       )
       if (!slot) throw new ConflictError('TimeSlot could not be released')
     })
   } finally {
     await session.endSession()
   }
   ```
2. **Manual compensation** (if transactions aren't available on the deployment tier): perform the `Appointment` update first, and if the `TimeSlot` release fails its precondition, atomically revert the `Appointment` back to its prior status before returning the conflict response — never leave a cancelled appointment whose slot is still stuck `booked`.

Never implement `cancel` as two independent `findOneAndUpdate` calls with no rollback path — a failure on the second call after the first succeeded is a silent data-loss bug (a cancelled appointment holding a slot forever unavailable).

## What NOT to Reach For
- **Application-level locks / mutexes / `LockService`-style patterns:** unnecessary complexity for this problem — MongoDB's per-document atomicity already solves the single-slot case. Reserve locking patterns for contexts without a real atomic-update primitive; this isn't that context.
- **Optimistic-locking version fields (`__v` checks) as the *primary* mechanism:** Mongoose's built-in versioning can coexist, but the `findOneAndUpdate` status-filter above is sufficient on its own and simpler to reason about. Don't add a second concurrency mechanism on top "just in case."
- **Retrying a failed conflict response automatically:** never auto-retry a hold/book that got rejected — that's the customer's decision (pick a different slot), not something to paper over silently.

## Testing This Layer
This is the one part of the codebase where "the code compiles and a sequential test passes" is explicitly not sufficient evidence of correctness (see `.rule/testing-rules.md`).

```typescript
// The test that actually proves the guarantee — genuinely concurrent, not sequential
it('allows exactly one of two simultaneous hold attempts on the same TimeSlot', async () => {
  const slot = await buildTimeSlot({ status: 'available' })

  const [resultA, resultB] = await Promise.allSettled([
    request(app).post(`/api/timeslots/${slot.id}/hold`).send(),
    request(app).post(`/api/timeslots/${slot.id}/hold`).send(),
  ])

  const statuses = [resultA, resultB].map((r) => r.value?.status ?? r.reason)
  expect(statuses.filter((s) => s === 200)).toHaveLength(1)
  expect(statuses.filter((s) => s === 409)).toHaveLength(1)

  const finalSlot = await TimeSlot.findOne({ uuid: slot.id })
  expect(finalSlot.status).toBe('held') // exactly one hold made it in
})
```
A test that `await`s the two requests one after another (`await postA(); await postB()`) proves nothing about the race — it proves sequential correctness, which was never in question. Use `Promise.all`/`Promise.allSettled` to actually fire them together.

## Implementation Checklist
- [ ] Every single-`TimeSlot` status transition (`hold`, `book`, hold-expiry) is one `findOneAndUpdate` with the precondition in the filter — never a separate `findById` + `save()`.
- [ ] `cancel` uses a transaction or an explicit compensating-rollback path across `Appointment` and `TimeSlot` — never two unguarded independent updates.
- [ ] No endpoint accepts a `status` field from the request body — the endpoint alone determines the resulting status.
- [ ] A genuinely concurrent test (`Promise.all`, not sequential `await`s) exists for `hold` and `book`.
- [ ] `409` is returned (not a generic 400/500) whenever a `TimeSlot` status precondition fails.
- [ ] No application-level lock/mutex/queue has been introduced for the single-slot case — if one is present, it's almost certainly unnecessary complexity worth removing.
