---
name: seat-concurrency-layer
description: Use this skill whenever writing, reviewing, or testing any code that changes the status of a contested resource (bookings, approve, cancel, and any other action competing for the same limited item). This is the highest-risk area in any codebase with a limited/shared resource — two actors racing on the same item must never both succeed.
references:
  - @backend-service-layer/SKILL.md
  - @.rule/database-rules.md
  - @.rule/testing-rules.md
  - @agents/security/CLAUDE.md
---

# TimeSlot Concurrency Layer
*Goal:* Guarantee that a `TimeSlot` can never be claimed by two customers at once, no matter how close together the requests arrive — without resorting to locks, queues, or anything that would make the UI feel slow or unresponsive.

**Why this exists as its own skill, not just a note in `backend-service-layer`:** most bugs are inconvenient. A double-booked `TimeSlot` is the one bug that reaches a real person expecting an appointment that's no longer available. It gets its own skill because it deserves a slower, more deliberate pass than "remember to use `findOneAndUpdate`."

## The Core Guarantee
For any two operations that target the same `TimeSlot` at nearly the same instant, **exactly one must succeed and the other must receive a conflict response (`409`).** Never both-succeed (double-booking), never both-fail (a slot stuck in limbo), never a lost update (one action silently overwriting the other with no error).

## Why Read-Then-Write Fails
```typescript
// This looks correct. It is not.
async function bookBROKEN(timeSlotId: string, customerInfo: CustomerInfo) {
  const slot = await TimeSlot.findById(timeSlotId)   // Request A reads: status = 'available'
                                                       // Request B reads: status = 'available'  ← both see the same state
  if (slot.status !== 'available') {
    throw new ConflictError('Time slot is no longer available')
  }
  slot.status = 'held'                                // Request A writes: status = 'held'
  await slot.save()                                   // Request B writes: status = 'held', overwriting A's claim
  return slot                                          // Both calls return success. Both customers think they booked it.
}
```
The failure mode isn't exotic — it's two HTTP requests arriving within a few milliseconds of each other, which happens constantly the moment two customers look at the same open slot and both tap "confirm" around the same time.

## The Fix: One Atomic Operation, Not Two
The check and the write must happen as a single database operation the DB itself makes atomic — never two round-trips from the application.

```typescript
// Correct — the database, not the application, decides who wins the race
async function bookTimeSlot(timeSlotId: string, customerInfo: CustomerInfo) {
  const slot = await TimeSlot.findOneAndUpdate(
    { _id: timeSlotId, status: 'available' },   // the condition is part of the same atomic operation as the write
    {
      $set: {
        status: 'held',
      },
    },
    { new: true }
  )

  if (!slot) {
    // findOneAndUpdate returned null: the condition { status: 'available' } didn't match
    // at the instant MongoDB evaluated it — someone else got there first.
    throw new ConflictError('Time slot is no longer available')
  }

  return slot
}
```
`findOneAndUpdate` (and `updateOne`, `findOneAndReplace`) are atomic **per document** in MongoDB — the filter and the update are evaluated as one indivisible operation. That's the entire mechanism. No manual locking, no `LockService`, no queue needed for the single-slot case.

## Per-Action Rules
| Action | Transition | Atomic filter |
|---|---|---|
| Customer books (`POST /api/appointments`) | `available` → `held` (TimeSlot), creates `Appointment(status: pending)` | `findOneAndUpdate({ _id: timeSlotId, status: 'available' }, { $set: { status: 'held' } })` |
| Admin approves (`PATCH /api/appointments/:id/approve`) | `Appointment: pending → approved`, `TimeSlot: held → booked` | `findOneAndUpdate({ _id: appointmentId, status: 'pending' }, { $set: { status: 'approved' } })` then the linked TimeSlot update, both inside the multi-document flow below |
| Admin/customer cancels (`PATCH /api/appointments/:id/cancel`) | `Appointment: pending/approved → cancelled`, `TimeSlot: held/booked → available` | `findOneAndUpdate({ _id: appointmentId, status: { $in: ['pending','approved'] } }, { $set: { status: 'cancelled' } })` then the linked TimeSlot update |
| Admin blocks (`PATCH /api/time-slots/:id/block`) | `available` → `blocked` | `findOneAndUpdate({ _id: timeSlotId, status: 'available' }, { $set: { status: 'blocked' } })` |
| Admin unblocks (`PATCH /api/time-slots/:id/unblock`) | `blocked` → `available` | `findOneAndUpdate({ _id: timeSlotId, status: 'blocked' }, { $set: { status: 'available' } })` |

Every row above is a single `findOneAndUpdate` — if it returns `null`, the controller returns `409`. There is no case in this table where reading first and writing second is acceptable, regardless of who the caller is. Actors racing each other (two customers both tapping "confirm" on the same slot) are just as real a race as an admin and a customer acting on the same appointment at once.

## The Multi-Document Case: Book / Approve / Cancel (Appointment + TimeSlot together)
Booking, approving, and cancelling each change **two** records at once (`Appointment` and its linked `TimeSlot`). MongoDB's single-document atomicity doesn't cover two documents at once. Two options, in order of preference:

1. **MongoDB transaction** (if the deployment tier/replica-set config supports it): wrap both `findOneAndUpdate` calls in a `session`, and abort the transaction if either update's precondition fails.
   ```typescript
   const session = await mongoose.startSession()
   try {
     await session.withTransaction(async () => {
       const slot = await TimeSlot.findOneAndUpdate(
         { _id: timeSlotId, status: 'available' },
         { $set: { status: 'held' } },
         { session, new: true }
       )
       if (!slot) throw new ConflictError('Time slot is no longer available')

       const appointment = await Appointment.create(
         [{ serviceId, timeSlotId: slot.uuid, customerName, customerPhone, customerEmail, status: 'pending' }],
         { session }
       )
     })
   } finally {
     await session.endSession()
   }
   ```
2. **Manual compensation** (if transactions aren't available on the deployment tier): perform the first atomic update (the `TimeSlot` transition), and if the second write (creating/updating the `Appointment`) fails, atomically revert the first before returning the conflict response — never leave a `TimeSlot` stuck `held` with no corresponding `Appointment`.

Never implement booking/approve/cancel as two independent `findOneAndUpdate` calls with no rollback path — a failure on the second call after the first succeeded is a silent data-loss bug (an orphaned `held` TimeSlot with no Appointment, or vice versa).

## What NOT to Reach For
- **Application-level locks / mutexes / `LockService`-style patterns:** unnecessary complexity for this problem — MongoDB's per-document atomicity already solves the single-item case. Reserve locking patterns for contexts without a real atomic-update primitive; this isn't that context.
- **Optimistic-locking version fields (`__v` checks) as the *primary* mechanism:** Mongoose's built-in versioning can coexist, but the `findOneAndUpdate` status-filter above is sufficient on its own and simpler to reason about. Don't add a second concurrency mechanism on top "just in case."
- **Retrying a failed conflict response automatically:** never auto-retry a claim that got rejected — that's the user's decision (pick a different item), not something to paper over silently.

## Testing This Layer
This is the one part of the codebase where "the code compiles and a sequential test passes" is explicitly not sufficient evidence of correctness (see `.rule/testing-rules.md`).

```typescript
// The test that actually proves the guarantee — genuinely concurrent, not sequential
it('allows exactly one of two simultaneous bookings for the same time slot', async () => {
  const slot = await buildTimeSlot({ status: 'available' })

  const [resultA, resultB] = await Promise.allSettled([
    request(app).post('/api/appointments').send({ timeSlotId: slot.id, ...customerA }),
    request(app).post('/api/appointments').send({ timeSlotId: slot.id, ...customerB }),
  ])

  const statuses = [resultA, resultB].map((r) => r.value?.status ?? r.reason)
  expect(statuses.filter((s) => s === 201)).toHaveLength(1)
  expect(statuses.filter((s) => s === 409)).toHaveLength(1)

  const finalSlot = await TimeSlot.findById(slot.id)
  expect(finalSlot.status).toBe('held') // exactly one customer's booking made it in
})
```
A test that `await`s the two requests one after another (`await postA(); await postB()`) proves nothing about the race — it proves sequential correctness, which was never in question. Use `Promise.all`/`Promise.allSettled` to actually fire them together.

## Implementation Checklist
- [ ] Every single-slot status transition is one `findOneAndUpdate` with the precondition in the filter — never a separate `findById` + `save()`.
- [ ] Book/approve/cancel (each touching `Appointment` + `TimeSlot`) use a transaction or an explicit compensating-rollback path — never two unguarded independent updates.
- [ ] No endpoint accepts a status field from the request body — the endpoint alone determines the resulting status.
- [ ] A genuinely concurrent test (`Promise.all`, not sequential `await`s) exists for every action in the Per-Action Rules table above.
- [ ] `409` is returned (not a generic 400/500) whenever a status precondition fails.
- [ ] No application-level lock/mutex/queue has been introduced for the single-slot case — if one is present, it's almost certainly unnecessary complexity worth removing.
