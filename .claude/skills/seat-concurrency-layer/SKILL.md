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

**Why this exists as its own skill, not just a note in `backend-service-layer`:** most bugs are inconvenient. A double-booked `TimeSlot` is the one bug that reaches a real person expecting an appointment slot that's no longer available. It gets its own skill because it deserves a slower, more deliberate pass than "remember to use `findOneAndUpdate`."

## The Core Guarantee
For any two operations that target the same `TimeSlot` at nearly the same instant, **exactly one must succeed and the other must receive a conflict response.** Never both-succeed (double-booking), never both-fail (a slot stuck in limbo), never a lost update (one customer's hold silently overwriting another's with no error).

## Why Read-Then-Write Fails
```typescript
// This looks correct. It is not.
async function holdBROKEN(timeSlotId: string) {
  const slot = await TimeSlot.findById(timeSlotId)   // Request A reads: status = 'open'
                                                       // Request B reads: status = 'open'  ← both see the same state
  if (slot.status !== 'open') {
    throw new ConflictError('Time slot is no longer available')
  }
  slot.status = 'held'                                // Request A writes: status = 'held'
  slot.heldAt = new Date()
  await slot.save()                                   // Request B writes: status = 'held', overwriting A's hold
  return slot                                          // Both calls return success. Both customers think they got the slot.
}
```
The failure mode isn't exotic — it's two HTTP requests arriving within a few milliseconds of each other, which happens constantly the moment a popular time slot is visible to multiple customers at once.

## The Fix: One Atomic Operation, Not Two
The check and the write must happen as a single database operation the DB itself makes atomic — never two round-trips from the application.

```typescript
// Correct — the database, not the application, decides who wins the race
async function hold(timeSlotId: string) {
  const slot = await TimeSlot.findOneAndUpdate(
    { _id: timeSlotId, status: 'open' },   // the condition is part of the same atomic operation as the write
    {
      $set: {
        status: 'held',
        heldAt: new Date(),
      },
    },
    { new: true }
  )

  if (!slot) {
    // findOneAndUpdate returned null: the condition { status: 'open' } didn't match
    // at the instant MongoDB evaluated it — someone else got there first.
    throw new ConflictError('Time slot is no longer available')
  }

  return slot
}
```
`findOneAndUpdate` (and `updateOne`, `findOneAndReplace`) are atomic **per document** in MongoDB — the filter and the update are evaluated as one indivisible operation. That's the entire mechanism. No manual locking, no `LockService`, no queue needed for the single-item case.

## Per-Action Rules
| Action | Transition | Atomic filter |
|---|---|---|
| Customer starts booking | `open` → `held` | `findOneAndUpdate({ _id, status: 'open' }, { $set: { status: 'held', heldAt: new Date() } })` |
| Customer submits contact details (creates `Appointment`) | `held` → `booked` | `findOneAndUpdate({ _id, status: 'held' }, { $set: { status: 'booked' } })`, in the same request that creates the `Appointment` document |
| Hold expires (customer abandons form) | `held` → `open` | `findOneAndUpdate({ _id, status: 'held', heldAt: { $lt: expiryCutoff } }, { $set: { status: 'open', heldAt: null } })` |
| Admin/customer cancels the `Appointment` | `booked` → `open` | `findOneAndUpdate({ _id, status: 'booked' }, { $set: { status: 'open' } })`, alongside setting the `Appointment.status` to `cancelled` |

Every row above is a single `findOneAndUpdate` — if it returns `null`, the controller returns `409`. There is no case in this table where reading first and writing second is acceptable, regardless of who the caller is.

## No Multi-Document Case in v1
This product has no action that must atomically change two `TimeSlot` documents at once (no swap/move between slots in v1) — each action above touches exactly one `TimeSlot`, optionally alongside creating/updating a single `Appointment` document in the same request. If a future feature needs to move a booking from one slot to another, revisit this section and add a MongoDB transaction (or manual compensation) at that point — don't build it speculatively now.

## What NOT to Reach For
- **Application-level locks / mutexes / `LockService`-style patterns:** unnecessary complexity for this problem — MongoDB's per-document atomicity already solves the single-slot case. Reserve locking patterns for contexts without a real atomic-update primitive; this isn't that context.
- **Optimistic-locking version fields (`__v` checks) as the *primary* mechanism:** Mongoose's built-in versioning can coexist, but the `findOneAndUpdate` status-filter above is sufficient on its own and simpler to reason about. Don't add a second concurrency mechanism on top "just in case."
- **Retrying a failed conflict response automatically:** never auto-retry a hold that got rejected — that's the customer's decision (pick a different slot), not something to paper over silently.

## Testing This Layer
This is the one part of the codebase where "the code compiles and a sequential test passes" is explicitly not sufficient evidence of correctness (see `.rule/testing-rules.md`).

```typescript
// The test that actually proves the guarantee — genuinely concurrent, not sequential
it('allows exactly one of two simultaneous holds for the same time slot', async () => {
  const slot = await buildTimeSlot({ status: 'open' })

  const [resultA, resultB] = await Promise.allSettled([
    request(app).post(`/api/time-slots/${slot.id}/hold`).send(),
    request(app).post(`/api/time-slots/${slot.id}/hold`).send(),
  ])

  const statuses = [resultA, resultB].map((r) => r.value?.status ?? r.reason)
  expect(statuses.filter((s) => s === 200)).toHaveLength(1)
  expect(statuses.filter((s) => s === 409)).toHaveLength(1)

  const finalSlot = await TimeSlot.findById(slot.id)
  expect(finalSlot.status).toBe('held') // exactly one customer's hold made it in
})
```
A test that `await`s the two requests one after another (`await postA(); await postB()`) proves nothing about the race — it proves sequential correctness, which was never in question. Use `Promise.all`/`Promise.allSettled` to actually fire them together.

## Implementation Checklist
- [ ] Every `TimeSlot` status transition is one `findOneAndUpdate` with the precondition in the filter — never a separate `findById` + `save()`.
- [ ] No endpoint accepts a status field from the request body — the endpoint alone determines the resulting status.
- [ ] A genuinely concurrent test (`Promise.all`, not sequential `await`s) exists for every action in the Per-Action Rules table above.
- [ ] `409` is returned (not a generic 400/500) whenever a status precondition fails.
- [ ] No application-level lock/mutex/queue has been introduced for the single-slot case — if one is present, it's almost certainly unnecessary complexity worth removing.
