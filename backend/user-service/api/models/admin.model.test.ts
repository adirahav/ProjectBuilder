import { describe, it, expect } from 'vitest'

import { Admin } from './admin.model.ts'

// These exercise the schema's serialization contract without needing a live
// Mongo connection — `new Admin(...)` builds a real document in memory.
describe('Admin model serialization', () => {
  it('exposes uuid as id and hides _id/__v', () => {
    const admin = new Admin({ email: 'admin@example.com', passwordHash: 'hashed' })

    const json = admin.toJSON() as Record<string, unknown>

    expect(json.id).toBe(admin.uuid)
    expect(json._id).toBeUndefined()
    expect(json.__v).toBeUndefined()
    expect(json.uuid).toBeUndefined()
  })

  it('never serializes passwordHash', () => {
    // Enforced in the schema so no controller has to remember to strip it.
    const admin = new Admin({ email: 'admin@example.com', passwordHash: 'super-secret-hash' })

    expect(JSON.stringify(admin)).not.toContain('super-secret-hash')
    expect((admin.toJSON() as Record<string, unknown>).passwordHash).toBeUndefined()
  })

  it('auto-generates a uuid', () => {
    const a = new Admin({ email: 'a@example.com', passwordHash: 'h' })
    const b = new Admin({ email: 'b@example.com', passwordHash: 'h' })

    expect(a.uuid).toBeTruthy()
    expect(a.uuid).not.toBe(b.uuid)
  })

  it('requires email and passwordHash', () => {
    const admin = new Admin({})

    const err = admin.validateSync()

    expect(err?.errors.email).toBeDefined()
    expect(err?.errors.passwordHash).toBeDefined()
  })
})
