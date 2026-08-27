import mongoose from 'mongoose'
import { afterAll, beforeAll, beforeEach, inject } from 'vitest'
import { Admin } from '../api/models/Admin.model.js'

beforeAll(async () => {
  await mongoose.connect(inject('mongoUri'))
  // Index builds are asynchronous in Mongoose. Without this the unique email
  // index may not exist yet when the first duplicate-signup test runs, which
  // would let a duplicate through and produce a confusing false pass.
  await Admin.syncIndexes()
})

// No shared mutable state between tests.
beforeEach(async () => {
  const collections = await mongoose.connection.db!.collections()
  // `deleteMany` rather than `drop`, so the unique email index survives between
  // test cases — dropping the collection would silently drop the index too.
  await Promise.all(collections.map((c) => c.deleteMany({})))
})

afterAll(async () => {
  await mongoose.disconnect()
})
