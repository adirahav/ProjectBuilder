import 'dotenv/config'
import bcrypt from 'bcryptjs'

import { connectDb, disconnectDb } from '../lib/db.ts'
import { Admin } from '../models/admin.model.ts'

/**
 * One-time bootstrap for the single v1 Admin account.
 *
 * There is no self-registration flow in this product (PRD: "the single
 * Admin"), so the account has to be provisioned out-of-band. Run manually,
 * once per environment:
 *
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run seed:admin
 *
 * Idempotent: re-running updates the existing Admin's password rather than
 * creating a second account or failing on the unique index.
 *
 * Deliberately NOT run on server boot — that would mean every environment
 * needs the plaintext admin password present in its runtime config forever,
 * and a stale env var would silently reset the password on each restart.
 */
const BCRYPT_ROUNDS = 12

async function seedAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD

  if (!email || !password) {
    throw new Error(
      'ADMIN_EMAIL and ADMIN_PASSWORD must both be set to run this seed',
    )
  }

  await connectDb()

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)

  await Admin.updateOne(
    { email },
    { $set: { passwordHash }, $setOnInsert: { email, createdAt: new Date() } },
    { upsert: true },
  )

  // The password is never logged — only the identifier it was set for.
  console.log(`user-service: seeded Admin account for ${email}`)
}

seedAdmin()
  .then(async () => {
    await disconnectDb()
    process.exit(0)
  })
  .catch(async (err: Error) => {
    console.error('user-service: admin seed failed:', err.message)
    await disconnectDb().catch(() => undefined)
    process.exit(1)
  })
