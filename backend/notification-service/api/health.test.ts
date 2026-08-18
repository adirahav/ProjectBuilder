import { describe, it, expect } from 'vitest'
import request from 'supertest'

import { createApp } from './app.ts'

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

  it('emits no CORS headers, since this service has no browser-facing routes', async () => {
    const res = await request(createApp())
      .get('/health')
      .set('Origin', 'http://evil.example.com')

    expect(res.status).toBe(200)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })
})

describe('unknown routes', () => {
  it('returns 404', async () => {
    const res = await request(createApp()).get('/does-not-exist')

    expect(res.status).toBe(404)
  })

  it('returns 404 for the not-yet-built F4b notification endpoint', async () => {
    // Guards the scope boundary of SCAFFOLD-NOT: the endpoint that receives
    // booking-confirmation calls from booking-service is a later ticket.
    const res = await request(createApp())
      .post('/api/notifications')
      .send({ appointmentId: 'x' })

    expect(res.status).toBe(404)
  })
})
