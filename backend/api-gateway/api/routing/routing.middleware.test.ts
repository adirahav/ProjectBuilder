import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import jwt from 'jsonwebtoken'

// Must run before the module graph (and therefore lib/config.ts) is imported.
const TEST_SECRET = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret-shared-with-user-service'
  return process.env.JWT_SECRET
})

const { verifyJwt } = await import('./routing.middleware.ts')

// A stand-in for a future Admin route (Screens 6-7) mounted behind the guard.
function guardedApp() {
  const app = express()
  app.use(express.json())
  app.get('/api/protected', verifyJwt, (req, res) => {
    res.status(200).json({
      admin: req.admin,
      internalHeader: req.headers['x-internal-admin'],
    })
  })
  return app
}

function sign(payload: object, options: jwt.SignOptions = {}) {
  return jwt.sign(payload, TEST_SECRET, options)
}

describe('verifyJwt', () => {
  it('accepts a valid token and attaches the decoded claims', async () => {
    const token = sign({ sub: 'admin-uuid', role: 'admin', email: 'admin@example.com' }, { expiresIn: '1h' })

    const res = await request(guardedApp())
      .get('/api/protected')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.admin.sub).toBe('admin-uuid')
    expect(res.body.admin.role).toBe('admin')
  })

  it('attaches x-internal-admin for downstream services', async () => {
    const token = sign({ sub: 'admin-uuid', role: 'admin' }, { expiresIn: '1h' })

    const res = await request(guardedApp())
      .get('/api/protected')
      .set('Authorization', `Bearer ${token}`)

    expect(res.body.internalHeader).toBe('admin-uuid')
  })

  it('overwrites a client-spoofed x-internal-admin header', async () => {
    const token = sign({ sub: 'real-admin', role: 'admin' }, { expiresIn: '1h' })

    const res = await request(guardedApp())
      .get('/api/protected')
      .set('Authorization', `Bearer ${token}`)
      .set('x-internal-admin', 'attacker-supplied')

    expect(res.body.internalHeader).toBe('real-admin')
  })

  it('rejects a missing Authorization header with 401', async () => {
    const res = await request(guardedApp()).get('/api/protected')

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it('rejects a malformed Authorization header with 401', async () => {
    const res = await request(guardedApp())
      .get('/api/protected')
      .set('Authorization', 'Basic dXNlcjpwYXNz')

    expect(res.status).toBe(401)
  })

  it('rejects an empty bearer value with 401', async () => {
    const res = await request(guardedApp())
      .get('/api/protected')
      .set('Authorization', 'Bearer ')

    expect(res.status).toBe(401)
  })

  it('rejects a garbage token with 401', async () => {
    const res = await request(guardedApp())
      .get('/api/protected')
      .set('Authorization', 'Bearer not.a.jwt')

    expect(res.status).toBe(401)
  })

  it('rejects an expired token with 401', async () => {
    const token = sign({ sub: 'admin-uuid', role: 'admin' }, { expiresIn: '-1s' })

    const res = await request(guardedApp())
      .get('/api/protected')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(401)
  })

  it('rejects a token signed with a different secret with 401', async () => {
    const token = jwt.sign({ sub: 'admin-uuid', role: 'admin' }, 'a-completely-different-secret', {
      expiresIn: '1h',
    })

    const res = await request(guardedApp())
      .get('/api/protected')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(401)
  })

  it('rejects a validly-signed token that lacks the admin role claim with 401', async () => {
    const token = sign({ sub: 'someone', role: 'customer' }, { expiresIn: '1h' })

    const res = await request(guardedApp())
      .get('/api/protected')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(401)
  })

  it('never leaks why the token was rejected', async () => {
    const expired = sign({ sub: 'admin-uuid', role: 'admin' }, { expiresIn: '-1s' })

    const expiredRes = await request(guardedApp())
      .get('/api/protected')
      .set('Authorization', `Bearer ${expired}`)
    const garbageRes = await request(guardedApp())
      .get('/api/protected')
      .set('Authorization', 'Bearer not.a.jwt')

    expect(expiredRes.body).toEqual(garbageRes.body)
  })
})
