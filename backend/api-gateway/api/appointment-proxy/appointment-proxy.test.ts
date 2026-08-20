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

const APPOINTMENT_ID = '7c1f9a2e-4d3b-4a51-9f6c-2b8e0d5a7c31'

const APPOINTMENT = {
  id: APPOINTMENT_ID,
  serviceId: '1b2c3d4e-5f60-4718-9a2b-3c4d5e6f7a8b',
  timeSlotId: '9e8d7c6b-5a49-4382-b1c0-d9e8f7a6b5c4',
  customerName: 'Dana Levi',
  customerPhone: '050-123-4567',
  status: 'pending',
  service: { name: 'Full groom', durationMinutes: 90, price: 220 },
  timeSlot: { date: '2026-08-18', startTime: '09:00', endTime: '10:30' },
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

function sign(
  payload: object = { sub: 'admin-uuid', role: 'admin' },
  options: jwt.SignOptions = { expiresIn: '1h' },
) {
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
// The list route aggregates customer PII across the whole clinic, so these
// cases are the reason the route lives on the gateway at all. They prove it is
// actually gated, not merely hidden behind a client-side route guard.

describe('Admin Appointment routes are gated by verifyJwt', () => {
  const routes: Array<[string, (token?: string) => request.Test]> = [
    ['GET /api/appointments', (t) => withToken(request(createApp()).get('/api/appointments'), t)],
    [
      'GET /api/appointments with filters',
      (t) =>
        withToken(
          request(createApp()).get('/api/appointments?date=2026-08-18&status=pending'),
          t,
        ),
    ],
    [
      'PATCH /api/appointments/:id/confirm',
      (t) => withToken(request(createApp()).patch(`/api/appointments/${APPOINTMENT_ID}/confirm`), t),
    ],
    [
      'PATCH /api/appointments/:id/cancel',
      (t) => withToken(request(createApp()).patch(`/api/appointments/${APPOINTMENT_ID}/cancel`), t),
    ],
  ]

  function withToken(test: request.Test, token?: string): request.Test {
    return token ? test.set('Authorization', `Bearer ${token}`) : test
  }

  it.each(routes)('rejects %s with 401 when no token is sent', async (_label, send) => {
    const fetchMock = mockUpstream(200, [])

    const res = await send()

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Unauthorized' })
    // No customer PII may leave booking-service for an unauthenticated caller.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(routes)('rejects %s with 401 for an expired token', async (_label, send) => {
    const fetchMock = mockUpstream(200, [])
    const expired = sign({ sub: 'admin-uuid', role: 'admin' }, { expiresIn: '-1s' })

    const res = await send(expired)

    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(routes)(
    'rejects %s with 401 for a token signed with another secret',
    async (_label, send) => {
      const fetchMock = mockUpstream(200, [])
      const foreign = jwt.sign({ sub: 'admin-uuid', role: 'admin' }, 'a-different-secret', {
        expiresIn: '1h',
      })

      const res = await send(foreign)

      expect(res.status).toBe(401)
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it.each(routes)('rejects %s with 401 for a malformed Authorization header', async (_label, send) => {
    const fetchMock = mockUpstream(200, [])

    const res = await send('not-a-jwt')

    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// --- GET /api/appointments --------------------------------------------------

describe('GET /api/appointments', () => {
  it('returns every Appointment, including cancelled ones', async () => {
    const cancelled = { ...APPOINTMENT, id: 'aa11bb22-cc33-4d44-8e55-ff6677889900', status: 'cancelled' }
    mockUpstream(200, [APPOINTMENT, cancelled])

    const res = await request(createApp()).get('/api/appointments').set('Authorization', auth())

    expect(res.status).toBe(200)
    expect(res.body).toEqual([APPOINTMENT, cancelled])
  })

  it('forwards to booking-service /api/appointments', async () => {
    mockUpstream(200, [])

    await request(createApp()).get('/api/appointments').set('Authorization', auth())

    expect(calls[0].url).toBe('http://booking.test:4001/api/appointments')
    expect(calls[0].method).toBe('GET')
  })

  it('treats an empty array as a valid answer, not an error', async () => {
    mockUpstream(200, [])

    const res = await request(createApp()).get('/api/appointments').set('Authorization', auth())

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('relays a row whose service and timeSlot joins are absent', async () => {
    // A Service or TimeSlot removed underneath an existing booking must still
    // leave a readable row — the gateway must not require the joins.
    const bare = {
      id: APPOINTMENT_ID,
      serviceId: APPOINTMENT.serviceId,
      timeSlotId: APPOINTMENT.timeSlotId,
      customerName: 'Dana Levi',
      customerPhone: '050-123-4567',
      status: 'pending',
    }
    mockUpstream(200, [bare])

    const res = await request(createApp()).get('/api/appointments').set('Authorization', auth())

    expect(res.status).toBe(200)
    expect(res.body).toEqual([bare])
  })

  it('sets x-internal-admin from the verified token', async () => {
    mockUpstream(200, [])

    await request(createApp()).get('/api/appointments').set('Authorization', auth())

    expect(calls[0].headers['x-internal-admin']).toBe('admin-uuid')
  })

  it('never relays a client-spoofed x-internal-admin header', async () => {
    mockUpstream(200, [])

    await request(createApp())
      .get('/api/appointments')
      .set('Authorization', auth())
      .set('x-internal-admin', 'attacker-supplied')

    expect(calls[0].headers['x-internal-admin']).toBe('admin-uuid')
  })

  // --- Filters --------------------------------------------------------------

  it('forwards the date filter', async () => {
    mockUpstream(200, [])

    await request(createApp())
      .get('/api/appointments?date=2026-08-18')
      .set('Authorization', auth())

    expect(calls[0].url).toBe('http://booking.test:4001/api/appointments?date=2026-08-18')
  })

  it('forwards the status filter', async () => {
    mockUpstream(200, [])

    await request(createApp())
      .get('/api/appointments?status=confirmed')
      .set('Authorization', auth())

    expect(calls[0].url).toBe('http://booking.test:4001/api/appointments?status=confirmed')
  })

  it('forwards both filters together — they are independent', async () => {
    mockUpstream(200, [])

    await request(createApp())
      .get('/api/appointments?date=2026-08-18&status=pending')
      .set('Authorization', auth())

    expect(calls[0].url).toBe(
      'http://booking.test:4001/api/appointments?date=2026-08-18&status=pending',
    )
  })

  it('accepts a past date — the Admin needs to look back at yesterday', async () => {
    mockUpstream(200, [])

    const res = await request(createApp())
      .get('/api/appointments?date=2020-01-01')
      .set('Authorization', auth())

    expect(res.status).toBe(200)
    expect(calls[0].url).toContain('date=2020-01-01')
  })

  it.each(['pending', 'confirmed', 'cancelled'])('accepts status=%s', async (status) => {
    mockUpstream(200, [])

    const res = await request(createApp())
      .get(`/api/appointments?status=${status}`)
      .set('Authorization', auth())

    expect(res.status).toBe(200)
    expect(calls[0].url).toContain(`status=${status}`)
  })

  it('sends no query string at all when neither filter is given', async () => {
    mockUpstream(200, [])

    await request(createApp()).get('/api/appointments').set('Authorization', auth())

    expect(calls[0].url).not.toContain('?')
  })

  it.each([
    ['an empty date', '?date='],
    ['an empty status', '?status='],
    ['both empty', '?date=&status='],
  ])('drops %s rather than matching on an empty string', async (_label, qs) => {
    mockUpstream(200, [])

    const res = await request(createApp())
      .get(`/api/appointments${qs}`)
      .set('Authorization', auth())

    // Absent must never be read as "match empty" — the filter is dropped, so
    // booking-service sees an unnarrowed list request.
    expect(res.status).toBe(200)
    expect(calls[0].url).not.toContain('?')
  })

  it('ignores unknown query parameters instead of forwarding them', async () => {
    mockUpstream(200, [])

    await request(createApp())
      .get('/api/appointments?limit=9999&customerPhone=050-123-4567')
      .set('Authorization', auth())

    expect(calls[0].url).toBe('http://booking.test:4001/api/appointments')
  })

  it.each([
    ['an unrecognized status', '?status=archived'],
    ['a status differing only in case', '?status=Pending'],
    ['a repeated status parameter', '?status=pending&status=cancelled'],
  ])('returns 400 for %s, without calling booking-service', async (_label, qs) => {
    const fetchMock = mockUpstream(200, [])

    const res = await request(createApp())
      .get(`/api/appointments${qs}`)
      .set('Authorization', auth())

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('status must be one of pending, confirmed, cancelled')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['a non-date string', '?date=tuesday'],
    ['a wrong format', '?date=18-08-2026'],
    ['an impossible calendar day', '?date=2026-02-30'],
    ['a month out of range', '?date=2026-13-01'],
    ['a repeated date parameter', '?date=2026-08-18&date=2026-08-19'],
  ])('returns 400 for %s, without calling booking-service', async (_label, qs) => {
    const fetchMock = mockUpstream(200, [])

    const res = await request(createApp())
      .get(`/api/appointments${qs}`)
      .set('Authorization', auth())

    expect(res.status).toBe(400)
    expect(typeof res.body.error).toBe('string')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('relays a 400 from booking-service rather than masking it as 502', async () => {
    mockUpstream(400, { error: 'date is out of the supported range' })

    const res = await request(createApp())
      .get('/api/appointments?date=2026-08-18')
      .set('Authorization', auth())

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'date is out of the supported range' })
  })

  it('returns 502 when booking-service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))

    const res = await request(createApp()).get('/api/appointments').set('Authorization', auth())

    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'Booking service unavailable' })
  })

  it('returns 502 when booking-service reports its database is down (503)', async () => {
    mockUpstream(503, { error: 'Database not connected' })

    const res = await request(createApp()).get('/api/appointments').set('Authorization', auth())

    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'Booking service unavailable' })
  })
})

// --- PATCH /api/appointments/:id/confirm ------------------------------------

describe('PATCH /api/appointments/:id/confirm', () => {
  it('returns 200 with the Appointment now confirmed', async () => {
    mockUpstream(200, { ...APPOINTMENT, status: 'confirmed' })

    const res = await request(createApp())
      .patch(`/api/appointments/${APPOINTMENT_ID}/confirm`)
      .set('Authorization', auth())

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('confirmed')
  })

  it('forwards to the dedicated confirm path with no body', async () => {
    mockUpstream(200, { ...APPOINTMENT, status: 'confirmed' })

    await request(createApp())
      .patch(`/api/appointments/${APPOINTMENT_ID}/confirm`)
      .set('Authorization', auth())

    expect(calls[0].url).toBe(
      `http://booking.test:4001/api/appointments/${APPOINTMENT_ID}/confirm`,
    )
    expect(calls[0].method).toBe('PATCH')
    expect(calls[0].body).toBeUndefined()
  })

  it('ignores any body the client sends — confirm takes no input', async () => {
    mockUpstream(200, { ...APPOINTMENT, status: 'confirmed' })

    await request(createApp())
      .patch(`/api/appointments/${APPOINTMENT_ID}/confirm`)
      .set('Authorization', auth())
      // A client must never be able to choose the resulting status.
      .send({ status: 'cancelled', customerName: 'someone else' })

    expect(calls[0].body).toBeUndefined()
  })

  it('returns 404 when booking-service does not know the id', async () => {
    mockUpstream(404, { error: 'nope' })

    const res = await request(createApp())
      .patch(`/api/appointments/${APPOINTMENT_ID}/confirm`)
      .set('Authorization', auth())

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Appointment not found' })
  })

  it('returns 404 for a non-uuid id without calling booking-service', async () => {
    const fetchMock = mockUpstream(200, APPOINTMENT)

    const res = await request(createApp())
      .patch('/api/appointments/not-a-uuid/confirm')
      .set('Authorization', auth())

    expect(res.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 409 when the Appointment is not pending', async () => {
    mockUpstream(409, { error: 'Appointment is not pending' })

    const res = await request(createApp())
      .patch(`/api/appointments/${APPOINTMENT_ID}/confirm`)
      .set('Authorization', auth())

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'Appointment is not pending' })
  })

  it('returns 502 when booking-service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))

    const res = await request(createApp())
      .patch(`/api/appointments/${APPOINTMENT_ID}/confirm`)
      .set('Authorization', auth())

    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'Booking service unavailable' })
  })
})

// --- PATCH /api/appointments/:id/cancel -------------------------------------

describe('PATCH /api/appointments/:id/cancel', () => {
  it('returns 200 with the Appointment now cancelled', async () => {
    mockUpstream(200, { ...APPOINTMENT, status: 'cancelled' })

    const res = await request(createApp())
      .patch(`/api/appointments/${APPOINTMENT_ID}/cancel`)
      .set('Authorization', auth())

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('cancelled')
  })

  it('forwards to the dedicated cancel path with no body', async () => {
    mockUpstream(200, { ...APPOINTMENT, status: 'cancelled' })

    await request(createApp())
      .patch(`/api/appointments/${APPOINTMENT_ID}/cancel`)
      .set('Authorization', auth())

    expect(calls[0].url).toBe(`http://booking.test:4001/api/appointments/${APPOINTMENT_ID}/cancel`)
    expect(calls[0].method).toBe('PATCH')
    expect(calls[0].body).toBeUndefined()
  })

  it('makes exactly ONE upstream call — the TimeSlot release is not a second request', async () => {
    // A gateway that cancelled the booking and then failed its own follow-up
    // request would strand a time nobody could ever book. booking-service owns
    // both writes.
    const fetchMock = mockUpstream(200, { ...APPOINTMENT, status: 'cancelled' })

    await request(createApp())
      .patch(`/api/appointments/${APPOINTMENT_ID}/cancel`)
      .set('Authorization', auth())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(calls.every((c) => !c.url.includes('time-slot'))).toBe(true)
  })

  it('is routed to cancel, not captured by the confirm route', async () => {
    mockUpstream(200, { ...APPOINTMENT, status: 'cancelled' })

    await request(createApp())
      .patch(`/api/appointments/${APPOINTMENT_ID}/cancel`)
      .set('Authorization', auth())

    expect(calls[0].url.endsWith('/cancel')).toBe(true)
  })

  it('ignores any body the client sends — cancel takes no input', async () => {
    mockUpstream(200, { ...APPOINTMENT, status: 'cancelled' })

    await request(createApp())
      .patch(`/api/appointments/${APPOINTMENT_ID}/cancel`)
      .set('Authorization', auth())
      .send({ status: 'confirmed' })

    expect(calls[0].body).toBeUndefined()
  })

  it('returns 404 when booking-service does not know the id', async () => {
    mockUpstream(404, { error: 'nope' })

    const res = await request(createApp())
      .patch(`/api/appointments/${APPOINTMENT_ID}/cancel`)
      .set('Authorization', auth())

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Appointment not found' })
  })

  it('returns 404 for a non-uuid id without calling booking-service', async () => {
    const fetchMock = mockUpstream(200, APPOINTMENT)

    const res = await request(createApp())
      .patch('/api/appointments/../../etc/cancel')
      .set('Authorization', auth())

    expect(res.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 409 when the Appointment is already cancelled', async () => {
    mockUpstream(409, { error: 'Appointment is already cancelled' })

    const res = await request(createApp())
      .patch(`/api/appointments/${APPOINTMENT_ID}/cancel`)
      .set('Authorization', auth())

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'Appointment is already cancelled' })
  })

  it('gives exactly one 200 and one 409 for two simultaneous cancels', async () => {
    // booking-service applies the transition as a single conditional update, so
    // the loser of the race answers 409. The gateway must relay both verbatim
    // and never retry — a retry could double-release the TimeSlot.
    let served = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        served += 1
        return served === 1
          ? new Response(JSON.stringify({ ...APPOINTMENT, status: 'cancelled' }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          : new Response(JSON.stringify({ error: 'Appointment is already cancelled' }), {
              status: 409,
              headers: { 'Content-Type': 'application/json' },
            })
      }),
    )

    const app = createApp()
    const responses = await Promise.all([
      request(app).patch(`/api/appointments/${APPOINTMENT_ID}/cancel`).set('Authorization', auth()),
      request(app).patch(`/api/appointments/${APPOINTMENT_ID}/cancel`).set('Authorization', auth()),
    ])

    const statuses = responses.map((r) => r.status).sort()
    expect(statuses).toEqual([200, 409])
    // Exactly two upstream calls — no retry of the losing request.
    expect(served).toBe(2)
  })

  it('returns 502 when booking-service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))

    const res = await request(createApp())
      .patch(`/api/appointments/${APPOINTMENT_ID}/cancel`)
      .set('Authorization', auth())

    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'Booking service unavailable' })
  })
})

// --- Isolation from the public routes ---------------------------------------

describe('the public Appointment routes are not served by the gateway', () => {
  it('does not proxy an unauthenticated POST /api/appointments to booking-service', async () => {
    const fetchMock = mockUpstream(201, APPOINTMENT)

    const res = await request(createApp())
      .post('/api/appointments')
      .send({ serviceId: APPOINTMENT.serviceId, customerName: 'Dana Levi' })

    // Fail closed: the guard sits at the mount point, so this answers 401.
    // What matters is that it never reaches booking-service.
    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not proxy an unauthenticated GET /api/appointments/:id receipt', async () => {
    const fetchMock = mockUpstream(200, APPOINTMENT)

    const res = await request(createApp()).get(`/api/appointments/${APPOINTMENT_ID}`)

    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not expose an authenticated GET /api/appointments/:id — it is not in this contract', async () => {
    const fetchMock = mockUpstream(200, APPOINTMENT)

    const res = await request(createApp())
      .get(`/api/appointments/${APPOINTMENT_ID}`)
      .set('Authorization', auth())

    expect(res.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('leaves the Admin Service routes unaffected', async () => {
    mockUpstream(200, [])

    const res = await request(createApp()).get('/api/services/all').set('Authorization', auth())

    expect(res.status).toBe(200)
    expect(calls[0].url).toBe('http://booking.test:4001/api/services/all')
  })

  it('leaves GET /health unauthenticated', async () => {
    const res = await request(createApp()).get('/health')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })
})
