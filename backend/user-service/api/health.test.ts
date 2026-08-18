import { describe, it, expect, vi, afterEach } from 'vitest'
import request from 'supertest'

import { createApp } from './app.ts'
import * as db from './lib/db.ts'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /health', () => {
  it('returns 200 with an ok status and requires no auth', async () => {
    const res = await request(createApp()).get('/health')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })

  it('succeeds even when an Authorization header is absent or invalid', async () => {
    const res = await request(createApp())
      .get('/health')
      .set('Authorization', 'Bearer not-a-real-token')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })

  it('stays 200 even when the database is disconnected', async () => {
    // Liveness must not depend on Mongo — a DB outage should never make the
    // platform restart an otherwise-healthy process.
    vi.spyOn(db, 'isDbConnected').mockReturnValue(false)
    vi.spyOn(db, 'getDbStatus').mockReturnValue('disconnected')

    const res = await request(createApp()).get('/health')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })

  it('issues no database query', async () => {
    // Guards the rule that the liveness probe never touches the DB.
    const statusSpy = vi.spyOn(db, 'getDbStatus')

    await request(createApp()).get('/health')

    expect(statusSpy).not.toHaveBeenCalled()
  })
})

describe('GET /health/ready', () => {
  it('returns 200 and db: connected when Mongo is up', async () => {
    vi.spyOn(db, 'isDbConnected').mockReturnValue(true)
    vi.spyOn(db, 'getDbStatus').mockReturnValue('connected')

    const res = await request(createApp()).get('/health/ready')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok', db: 'connected' })
  })

  it('returns 503 and db: disconnected when Mongo is down, without crashing', async () => {
    vi.spyOn(db, 'isDbConnected').mockReturnValue(false)
    vi.spyOn(db, 'getDbStatus').mockReturnValue('disconnected')

    const res = await request(createApp()).get('/health/ready')

    expect(res.status).toBe(503)
    expect(res.body).toEqual({ status: 'degraded', db: 'disconnected' })
  })
})

describe('auth libraries', () => {
  // SCAFFOLD-USR installs jsonwebtoken and bcryptjs ahead of the F5 login
  // ticket; this proves they resolve without wiring them into any route.
  it('jsonwebtoken and bcryptjs are installed and importable', async () => {
    const jwt = await import('jsonwebtoken')
    const bcrypt = await import('bcryptjs')

    expect(typeof jwt.default.sign).toBe('function')
    expect(typeof bcrypt.default.hash).toBe('function')
  })
})

describe('unknown routes', () => {
  it('returns 404', async () => {
    const res = await request(createApp()).get('/does-not-exist')

    expect(res.status).toBe(404)
  })
})
