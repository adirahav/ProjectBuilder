import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import request from 'supertest'

import { createApp } from '../app.ts'

function mockUpstream(status: number, body: unknown) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    forwardedBodies.push(JSON.parse(String(init?.body ?? '{}')))
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

let forwardedBodies: Record<string, unknown>[] = []

beforeEach(() => {
  forwardedBodies = []
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('POST /api/auth/login', () => {
  it('returns 200 with the token and admin when user-service accepts the credentials', async () => {
    const upstream = {
      token: 'a.signed.jwt',
      admin: { id: '3d0f1a2b-4c5d-4e6f-8091-a2b3c4d5e6f7', email: 'admin@example.com' },
    }
    mockUpstream(200, upstream)

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: 'admin@example.com', password: 'correct-horse-battery-staple' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual(upstream)
  })

  it('relays the password untrimmed — leading/trailing spaces are real characters', async () => {
    mockUpstream(200, { token: 't', admin: { id: 'x', email: 'a@b.c' } })

    await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: '  admin@example.com  ', password: '  spaced  ' })

    const forwarded = forwardedBodies[0]
    expect(forwarded.password).toBe('  spaced  ')
    expect(forwarded.identifier).toBe('admin@example.com')
  })

  it('forwards only identifier and password, dropping any extra client fields', async () => {
    mockUpstream(200, { token: 't', admin: { id: 'x', email: 'a@b.c' } })

    await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: 'admin@example.com', password: 'pw', role: 'superadmin', isAdmin: true })

    expect(Object.keys(forwardedBodies[0]).sort()).toEqual(['identifier', 'password'])
  })

  it('returns 401 with a generic message for a wrong password', async () => {
    mockUpstream(401, { error: 'Invalid credentials' })

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: 'admin@example.com', password: 'wrong' })

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Invalid credentials' })
  })

  it('returns an identical 401 body for an unknown identifier (no user enumeration)', async () => {
    mockUpstream(401, { error: 'No such account' })

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: 'nobody@example.com', password: 'wrong' })

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Invalid credentials' })
  })

  it('never echoes the submitted password in any response body', async () => {
    mockUpstream(401, { error: 'Invalid credentials' })

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: 'admin@example.com', password: 'super-secret-pw' })

    expect(JSON.stringify(res.body)).not.toContain('super-secret-pw')
  })

  it('returns 400 when the identifier is missing', async () => {
    const fetchMock = mockUpstream(200, {})

    const res = await request(createApp()).post('/api/auth/login').send({ password: 'pw' })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Identifier and password are required' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 400 when the password is missing', async () => {
    const fetchMock = mockUpstream(200, {})

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: 'admin@example.com' })

    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 400 when the identifier is only whitespace', async () => {
    mockUpstream(200, {})

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: '   ', password: 'pw' })

    expect(res.status).toBe(400)
  })

  it('returns 502 when user-service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: 'admin@example.com', password: 'pw' })

    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'Authentication service unavailable' })
  })

  it('returns 502 — never a credential error — when user-service returns a 500', async () => {
    mockUpstream(500, { error: 'boom' })

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: 'admin@example.com', password: 'pw' })

    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'Authentication service unavailable' })
  })

  it('requires no Authorization header — this is how the token is obtained', async () => {
    mockUpstream(200, { token: 't', admin: { id: 'x', email: 'a@b.c' } })

    const res = await request(createApp())
      .post('/api/auth/login')
      .send({ identifier: 'admin@example.com', password: 'pw' })

    expect(res.status).toBe(200)
  })
})
