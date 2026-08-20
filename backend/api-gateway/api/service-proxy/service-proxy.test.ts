import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'

// Must run before the module graph (and therefore lib/config.ts) is imported.
const TEST_SECRET = vi.hoisted(() => {
  process.env.JWT_SECRET = 'test-secret-shared-with-user-service'
  process.env.BOOKING_SERVICE_URL = 'http://booking.test:4001'
  return process.env.JWT_SECRET
})

const { createApp } = await import('../app.ts')

const SERVICE_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

const SERVICE = {
  id: SERVICE_ID,
  name: 'Full groom',
  durationMinutes: 90,
  price: 220,
  isActive: true,
}

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown }

let calls: Call[] = []

function mockUpstream(status: number, body: unknown) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: String(init?.method),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    })
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function sign(payload: object = { sub: 'admin-uuid', role: 'admin' }, options: jwt.SignOptions = { expiresIn: '1h' }) {
  return jwt.sign(payload, TEST_SECRET, options)
}

function auth() {
  return `Bearer ${sign()}`
}

beforeEach(() => {
  calls = []
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// --- Auth gating ------------------------------------------------------------
// Proves the routes are actually gated, not merely hidden behind a client-side
// route guard.

describe('Admin Service routes are gated by verifyJwt', () => {
  // Each entry issues the request itself, so no dynamic method indexing is needed.
  const routes: Array<[string, (token?: string) => request.Test]> = [
    ['GET /api/services/all', (t) => withToken(request(createApp()).get('/api/services/all'), t)],
    ['POST /api/services', (t) => withToken(request(createApp()).post('/api/services'), t)],
    [
      'PATCH /api/services/:id',
      (t) => withToken(request(createApp()).patch(`/api/services/${SERVICE_ID}`), t),
    ],
    [
      'PATCH /api/services/:id/deactivate',
      (t) => withToken(request(createApp()).patch(`/api/services/${SERVICE_ID}/deactivate`), t),
    ],
  ]

  function withToken(test: request.Test, token?: string): request.Test {
    return token ? test.set('Authorization', `Bearer ${token}`) : test
  }

  it.each(routes)('rejects %s with 401 when no token is sent', async (_label, send) => {
    const fetchMock = mockUpstream(200, {})

    const res = await send()

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Unauthorized' })
    // The request must never reach booking-service.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(routes)('rejects %s with 401 for an expired token', async (_label, send) => {
    const fetchMock = mockUpstream(200, {})
    const expired = sign({ sub: 'admin-uuid', role: 'admin' }, { expiresIn: '-1s' })

    const res = await send(expired)

    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(routes)('rejects %s with 401 for a token signed with another secret', async (_label, send) => {
    const fetchMock = mockUpstream(200, {})
    const foreign = jwt.sign({ sub: 'admin-uuid', role: 'admin' }, 'a-different-secret', {
      expiresIn: '1h',
    })

    const res = await send(foreign)

    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// --- GET /api/services/all --------------------------------------------------

describe('GET /api/services/all', () => {
  it('returns every Service, active and deactivated alike', async () => {
    const inactive = { ...SERVICE, id: 'b1f0c2d3-4e5f-4a6b-8c9d-0e1f2a3b4c5d', isActive: false }
    mockUpstream(200, [SERVICE, inactive])

    const res = await request(createApp()).get('/api/services/all').set('Authorization', auth())

    expect(res.status).toBe(200)
    expect(res.body).toEqual([SERVICE, inactive])
  })

  it('forwards to booking-service /api/services/all', async () => {
    mockUpstream(200, [])

    await request(createApp()).get('/api/services/all').set('Authorization', auth())

    expect(calls[0].url).toBe('http://booking.test:4001/api/services/all')
    expect(calls[0].method).toBe('GET')
  })

  it('treats an empty array as a valid answer, not an error', async () => {
    mockUpstream(200, [])

    const res = await request(createApp()).get('/api/services/all').set('Authorization', auth())

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('sets x-internal-admin from the verified token', async () => {
    mockUpstream(200, [])

    await request(createApp()).get('/api/services/all').set('Authorization', auth())

    expect(calls[0].headers['x-internal-admin']).toBe('admin-uuid')
  })

  it('never relays a client-spoofed x-internal-admin header', async () => {
    mockUpstream(200, [])

    await request(createApp())
      .get('/api/services/all')
      .set('Authorization', auth())
      .set('x-internal-admin', 'attacker-supplied')

    expect(calls[0].headers['x-internal-admin']).toBe('admin-uuid')
  })

  it('returns 502 when booking-service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))

    const res = await request(createApp()).get('/api/services/all').set('Authorization', auth())

    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'Booking service unavailable' })
  })

  it('returns 502 when booking-service reports its database is down (503)', async () => {
    mockUpstream(503, { error: 'Database not connected' })

    const res = await request(createApp()).get('/api/services/all').set('Authorization', auth())

    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'Booking service unavailable' })
  })
})

// --- POST /api/services -----------------------------------------------------

describe('POST /api/services', () => {
  const draft = { name: 'Bath and brush', durationMinutes: 45, price: 120 }

  it('returns 201 with the created Service', async () => {
    mockUpstream(201, { ...SERVICE, ...draft })

    const res = await request(createApp())
      .post('/api/services')
      .set('Authorization', auth())
      .send(draft)

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject(draft)
    expect(res.body.isActive).toBe(true)
  })

  it('forwards to booking-service POST /api/services', async () => {
    mockUpstream(201, SERVICE)

    await request(createApp()).post('/api/services').set('Authorization', auth()).send(draft)

    expect(calls[0].url).toBe('http://booking.test:4001/api/services')
    expect(calls[0].method).toBe('POST')
  })

  it('never relays isActive on create — a new Service is always active', async () => {
    mockUpstream(201, SERVICE)

    await request(createApp())
      .post('/api/services')
      .set('Authorization', auth())
      .send({ ...draft, isActive: false })

    expect(Object.keys(calls[0].body as object).sort()).toEqual([
      'durationMinutes',
      'name',
      'price',
    ])
  })

  it('drops unknown client fields such as an injected id', async () => {
    mockUpstream(201, SERVICE)

    await request(createApp())
      .post('/api/services')
      .set('Authorization', auth())
      .send({ ...draft, id: 'attacker-chosen', _id: 'mongo-id' })

    expect(Object.keys(calls[0].body as object).sort()).toEqual([
      'durationMinutes',
      'name',
      'price',
    ])
  })

  it('trims the name before forwarding', async () => {
    mockUpstream(201, SERVICE)

    await request(createApp())
      .post('/api/services')
      .set('Authorization', auth())
      .send({ ...draft, name: '  Bath and brush  ' })

    expect((calls[0].body as { name: string }).name).toBe('Bath and brush')
  })

  it('accepts a price of zero — a complimentary treatment is a real case', async () => {
    mockUpstream(201, { ...SERVICE, price: 0 })

    const res = await request(createApp())
      .post('/api/services')
      .set('Authorization', auth())
      .send({ ...draft, price: 0 })

    expect(res.status).toBe(201)
    expect((calls[0].body as { price: number }).price).toBe(0)
  })

  it.each([
    ['a missing name', { durationMinutes: 45, price: 120 }],
    ['a blank name', { name: '   ', durationMinutes: 45, price: 120 }],
    ['a name over 60 characters', { name: 'x'.repeat(61), durationMinutes: 45, price: 120 }],
    ['a missing duration', { name: 'A', price: 120 }],
    ['a fractional duration', { name: 'A', durationMinutes: 45.5, price: 120 }],
    ['a zero duration', { name: 'A', durationMinutes: 0, price: 120 }],
    ['a duration over 480', { name: 'A', durationMinutes: 481, price: 120 }],
    ['a non-numeric duration', { name: 'A', durationMinutes: '45', price: 120 }],
    ['a missing price', { name: 'A', durationMinutes: 45 }],
    ['a negative price', { name: 'A', durationMinutes: 45, price: -1 }],
    ['a non-numeric price', { name: 'A', durationMinutes: 45, price: '120' }],
  ])('returns 400 for %s, without calling booking-service', async (_label, body) => {
    const fetchMock = mockUpstream(201, SERVICE)

    const res = await request(createApp())
      .post('/api/services')
      .set('Authorization', auth())
      .send(body)

    expect(res.status).toBe(400)
    expect(typeof res.body.error).toBe('string')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('relays a 400 from booking-service rather than masking it as 502', async () => {
    mockUpstream(400, { error: 'Name already in use' })

    const res = await request(createApp())
      .post('/api/services')
      .set('Authorization', auth())
      .send(draft)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'Name already in use' })
  })

  it('returns 502 when booking-service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))

    const res = await request(createApp())
      .post('/api/services')
      .set('Authorization', auth())
      .send(draft)

    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'Booking service unavailable' })
  })
})

// --- PATCH /api/services/:id ------------------------------------------------

describe('PATCH /api/services/:id', () => {
  it('returns 200 with the updated Service', async () => {
    mockUpstream(200, { ...SERVICE, price: 250 })

    const res = await request(createApp())
      .patch(`/api/services/${SERVICE_ID}`)
      .set('Authorization', auth())
      .send({ price: 250 })

    expect(res.status).toBe(200)
    expect(res.body.price).toBe(250)
  })

  it('forwards ONLY the fields the Admin actually changed', async () => {
    mockUpstream(200, SERVICE)

    await request(createApp())
      .patch(`/api/services/${SERVICE_ID}`)
      .set('Authorization', auth())
      .send({ price: 250 })

    expect(calls[0].body).toEqual({ price: 250 })
    expect(calls[0].url).toBe(`http://booking.test:4001/api/services/${SERVICE_ID}`)
  })

  it('supports re-activating a soft-deleted Service via isActive: true', async () => {
    mockUpstream(200, { ...SERVICE, isActive: true })

    const res = await request(createApp())
      .patch(`/api/services/${SERVICE_ID}`)
      .set('Authorization', auth())
      .send({ isActive: true })

    expect(res.status).toBe(200)
    expect(calls[0].body).toEqual({ isActive: true })
  })

  it('does not validate absent fields — omitting a name is not blanking it', async () => {
    mockUpstream(200, SERVICE)

    const res = await request(createApp())
      .patch(`/api/services/${SERVICE_ID}`)
      .set('Authorization', auth())
      .send({ durationMinutes: 60 })

    expect(res.status).toBe(200)
  })

  it('returns 400 for an empty body', async () => {
    const fetchMock = mockUpstream(200, SERVICE)

    const res = await request(createApp())
      .patch(`/api/services/${SERVICE_ID}`)
      .set('Authorization', auth())
      .send({})

    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 400 for a body containing only unknown fields', async () => {
    const fetchMock = mockUpstream(200, SERVICE)

    const res = await request(createApp())
      .patch(`/api/services/${SERVICE_ID}`)
      .set('Authorization', auth())
      .send({ nickname: 'shortcut' })

    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['a blank name', { name: '  ' }],
    ['a fractional duration', { durationMinutes: 30.25 }],
    ['a duration over 480', { durationMinutes: 999 }],
    ['a negative price', { price: -5 }],
    ['a non-boolean isActive', { isActive: 'yes' }],
  ])('returns 400 for %s that IS present', async (_label, body) => {
    const fetchMock = mockUpstream(200, SERVICE)

    const res = await request(createApp())
      .patch(`/api/services/${SERVICE_ID}`)
      .set('Authorization', auth())
      .send(body)

    expect(res.status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 404 when booking-service does not know the id', async () => {
    mockUpstream(404, { error: 'not found' })

    const res = await request(createApp())
      .patch(`/api/services/${SERVICE_ID}`)
      .set('Authorization', auth())
      .send({ price: 1 })

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Service not found' })
  })

  it('returns 404 for a non-uuid id without calling booking-service', async () => {
    const fetchMock = mockUpstream(200, SERVICE)

    const res = await request(createApp())
      .patch('/api/services/not-a-uuid')
      .set('Authorization', auth())
      .send({ price: 1 })

    expect(res.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 502 when booking-service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))

    const res = await request(createApp())
      .patch(`/api/services/${SERVICE_ID}`)
      .set('Authorization', auth())
      .send({ price: 1 })

    expect(res.status).toBe(502)
  })
})

// --- PATCH /api/services/:id/deactivate -------------------------------------

describe('PATCH /api/services/:id/deactivate', () => {
  it('returns 200 with the Service now inactive', async () => {
    mockUpstream(200, { ...SERVICE, isActive: false })

    const res = await request(createApp())
      .patch(`/api/services/${SERVICE_ID}/deactivate`)
      .set('Authorization', auth())

    expect(res.status).toBe(200)
    expect(res.body.isActive).toBe(false)
  })

  it('forwards to the dedicated deactivate path with no body', async () => {
    mockUpstream(200, { ...SERVICE, isActive: false })

    await request(createApp())
      .patch(`/api/services/${SERVICE_ID}/deactivate`)
      .set('Authorization', auth())

    expect(calls[0].url).toBe(`http://booking.test:4001/api/services/${SERVICE_ID}/deactivate`)
    expect(calls[0].method).toBe('PATCH')
    expect(calls[0].body).toBeUndefined()
  })

  it('ignores any body the client sends — deactivate takes no input', async () => {
    mockUpstream(200, { ...SERVICE, isActive: false })

    await request(createApp())
      .patch(`/api/services/${SERVICE_ID}/deactivate`)
      .set('Authorization', auth())
      .send({ isActive: true, name: 'renamed' })

    expect(calls[0].body).toBeUndefined()
  })

  it('is routed to deactivate, not captured by the bare PATCH /:id route', async () => {
    mockUpstream(200, { ...SERVICE, isActive: false })

    await request(createApp())
      .patch(`/api/services/${SERVICE_ID}/deactivate`)
      .set('Authorization', auth())

    expect(calls[0].url.endsWith('/deactivate')).toBe(true)
  })

  it('returns 404 when booking-service does not know the id', async () => {
    mockUpstream(404, { error: 'nope' })

    const res = await request(createApp())
      .patch(`/api/services/${SERVICE_ID}/deactivate`)
      .set('Authorization', auth())

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Service not found' })
  })

  it('returns 502 when booking-service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))

    const res = await request(createApp())
      .patch(`/api/services/${SERVICE_ID}/deactivate`)
      .set('Authorization', auth())

    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'Booking service unavailable' })
  })
})

// --- Isolation from the public route ----------------------------------------

describe('the public GET /api/services is not served by the gateway', () => {
  it('does not proxy an unauthenticated GET /api/services to booking-service', async () => {
    const fetchMock = mockUpstream(200, [SERVICE])

    const res = await request(createApp()).get('/api/services')

    // Fail closed: the guard sits at the mount point, so this answers 401.
    // What matters is that it never reaches booking-service.
    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('leaves GET /health unauthenticated', async () => {
    const res = await request(createApp()).get('/health')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })
})
