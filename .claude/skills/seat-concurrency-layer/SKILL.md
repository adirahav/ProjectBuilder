---
name: seat-concurrency-layer
description: Use this skill whenever writing, reviewing, or testing any code that changes the status of a contested resource (bookings, approve, cancel, and any other action competing for the same limited item). This is the highest-risk area in any codebase with a limited/shared resource — two actors racing on the same item must never both succeed.
references:
  - @backend-service-layer/SKILL.md
  - @.rule/database-rules.md
  - @.rule/testing-rules.md
  - @agents/security/CLAUDE.md
---

<!--
TEMPLATE — fill in ONLY if this project has a contested/limited resource (inventory, seats, slots, tickets, coupons, etc.). If not, delete this skill file and its references from other skills.
Placeholders:
  {{CONTESTED_ENTITY}}     — e.g. Seat, InventoryItem, Slot, Ticket
  {{STATUS_VALUES}}        — the entity's status enum, e.g. available/pending/taken
  {{ACTIONS_TABLE}}        — table of action / transition / atomic filter, one row per status-changing action
  {{MULTI_DOC_ACTION}}     — the one action (if any) touching two documents at once, e.g. "swap-move"
  {{RENAME_SKILL_TO}}      — suggest renaming this skill/folder to "<entity>-concurrency-layer" for the new project
Ask the user: "Is there a resource with race-condition risk (inventory, seats, slots, tickets)?" "What are its valid status transitions and which actions trigger them?" "Is there any action that must change two records atomically together?"
-->

# {{CONTESTED_ENTITY}} Concurrency Layer
*Goal:* Guarantee that a `{{CONTESTED_ENTITY}}` can never be claimed by two actors/actions at once, no matter how close together the requests arrive — without resorting to locks, queues, or anything that would make the UI feel slow or unresponsive.

**Why this exists as its own skill, not just a note in `backend-service-layer`:** most bugs are inconvenient. A double-allocated `{{CONTESTED_ENTITY}}` is the one bug that reaches a real person expecting something that's no longer available. It gets its own skill because it deserves a slower, more deliberate pass than "remember to use `findOneAndUpdate`."

## The Core Guarantee
For any two operations that target the same `{{CONTESTED_ENTITY}}` at nearly the same instant, **exactly one must succeed and the other must receive a conflict response.** Never both-succeed (double-allocation), never both-fail (an item stuck in limbo), never a lost update (one action silently overwriting the other with no error).

## Why Read-Then-Write Fails
```typescript
// This looks correct. It is not.
async function claimBROKEN(itemId: string, requesterInfo: RequesterInfo) {
  const item = await Item.findById(itemId)          // Request A reads: status = 'available'
                                                       // Request B reads: status = 'available'  ← both see the same state
  if (item.status !== 'available') {
    throw new ConflictError('Item is no longer available')
  }
  item.status = 'pending'                             // Request A writes: status = 'pending'
  item.requesterName = requesterInfo.name
  await item.save()                                   // Request B writes: status = 'pending', overwriting A's requester info
  return item                                          // Both calls return success. Both requesters think they got it.
}
```
The failure mode isn't exotic — it's two HTTP requests arriving within a few milliseconds of each other, which happens constantly the moment demand spikes and multiple users act on the same visually-available item.

## The Fix: One Atomic Operation, Not Two
The check and the write must happen as a single database operation the DB itself makes atomic — never two round-trips from the application.

```typescript
// Correct — the database, not the application, decides who wins the race
async function claim(itemId: string, requesterInfo: RequesterInfo) {
  const item = await Item.findOneAndUpdate(
    { _id: itemId, status: 'available' },   // the condition is part of the same atomic operation as the write
    {
      $set: {
        status: 'pending',
        requesterName: requesterInfo.name,
        requestedAt: new Date(),
      },
    },
    { new: true }
  )

  if (!item) {
    // findOneAndUpdate returned null: the condition { status: 'available' } didn't match
    // at the instant MongoDB evaluated it — someone else got there first.
    throw new ConflictError('Item is no longer available')
  }

  return item
}
```
`findOneAndUpdate` (and `updateOne`, `findOneAndReplace`) are atomic **per document** in MongoDB — the filter and the update are evaluated as one indivisible operation. That's the entire mechanism. No manual locking, no `LockService`, no queue needed for the single-item case.

## Per-Action Rules
{{ACTIONS_TABLE}}

Every row above is a single `findOneAndUpdate` — if it returns `null`, the controller returns the conflict status. There is no case in this table where reading first and writing second is acceptable, regardless of who the caller is. Actors racing each other (two admins both clicking "approve" on the same request) are just as real a race as two end users.

## The Multi-Document Case: {{MULTI_DOC_ACTION}} (fill in if applicable)
If an action changes **two** records at once (e.g. moving an occupant from item X to item Y, or exchanging two occupants), MongoDB's single-document atomicity doesn't cover two documents at once. Two options, in order of preference:

1. **MongoDB transaction** (if the deployment tier/replica-set config supports it): wrap both `findOneAndUpdate` calls in a `session`, and abort the transaction if either update's precondition fails.
   ```typescript
   const session = await mongoose.startSession()
   try {
     await session.withTransaction(async () => {
       const fromItem = await Item.findOneAndUpdate(
         { _id: fromItemId, status: { $in: ['pending', 'taken'] } },
         { $set: { status: 'available', requesterName: null } },
         { session, new: true }
       )
       if (!fromItem) throw new ConflictError('Source item is not currently occupied')

       const toItem = await Item.findOneAndUpdate(
         { _id: toItemId, status: 'available' },
         { $set: { status: fromItem.status, requesterName: fromItem.requesterName } },
         { session, new: true }
       )
       if (!toItem) throw new ConflictError('Destination item is no longer available')
     })
   } finally {
     await session.endSession()
   }
   ```
2. **Manual compensation** (if transactions aren't available on the deployment tier): perform the first atomic update, and if the second one fails its precondition, atomically revert the first before returning the conflict response — never leave the source item in a "already vacated but destination also failed" state.

Never implement a multi-document action as two independent `findOneAndUpdate` calls with no rollback path — a failure on the second call after the first succeeded is a silent data-loss bug.

## What NOT to Reach For
- **Application-level locks / mutexes / `LockService`-style patterns:** unnecessary complexity for this problem — MongoDB's per-document atomicity already solves the single-item case. Reserve locking patterns for contexts without a real atomic-update primitive; this isn't that context.
- **Optimistic-locking version fields (`__v` checks) as the *primary* mechanism:** Mongoose's built-in versioning can coexist, but the `findOneAndUpdate` status-filter above is sufficient on its own and simpler to reason about. Don't add a second concurrency mechanism on top "just in case."
- **Retrying a failed conflict response automatically:** never auto-retry a claim that got rejected — that's the user's decision (pick a different item), not something to paper over silently.

## Testing This Layer
This is the one part of the codebase where "the code compiles and a sequential test passes" is explicitly not sufficient evidence of correctness (see `.rule/testing-rules.md`).

```typescript
// The test that actually proves the guarantee — genuinely concurrent, not sequential
it('allows exactly one of two simultaneous requests for the same item', async () => {
  const item = await buildItem({ status: 'available' })

  const [resultA, resultB] = await Promise.allSettled([
    request(app).post(`/api/items/${item.id}/claim`).send({ ...requesterA }),
    request(app).post(`/api/items/${item.id}/claim`).send({ ...requesterB }),
  ])

  const statuses = [resultA, resultB].map((r) => r.value?.status ?? r.reason)
  expect(statuses.filter((s) => s === 200)).toHaveLength(1)
  expect(statuses.filter((s) => s === 409)).toHaveLength(1)

  const finalItem = await Item.findById(item.id)
  expect(finalItem.status).toBe('pending') // exactly one requester's info made it in
})
```
A test that `await`s the two requests one after another (`await postA(); await postB()`) proves nothing about the race — it proves sequential correctness, which was never in question. Use `Promise.all`/`Promise.allSettled` to actually fire them together.

## Implementation Checklist
- [ ] Every single-item status transition is one `findOneAndUpdate` with the precondition in the filter — never a separate `findById` + `save()`.
- [ ] Any multi-document action uses a transaction or an explicit compensating-rollback path — never two unguarded independent updates.
- [ ] No endpoint accepts a status field from the request body — the endpoint alone determines the resulting status.
- [ ] A genuinely concurrent test (`Promise.all`, not sequential `await`s) exists for every action in the Per-Action Rules table above.
- [ ] The conflict status is returned (not a generic 400/500) whenever a status precondition fails.
- [ ] No application-level lock/mutex/queue has been introduced for the single-item case — if one is present, it's almost certainly unnecessary complexity worth removing.
