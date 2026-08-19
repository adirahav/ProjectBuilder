import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import request from 'supertest'

import { createApp } from '../app.ts'
import { getSentNotifications, resetSentNotifications } from './notification.service.ts'

const URL = '/api/notifications/appointment-confirmation'

const validPayload = {
  appointmentId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  serviceName: 'Full Groom',
  date: '2026-09-01',
  startTime: '09:30',
  customerName: 'Dana Levi',
  customerPhone: '0501234567',
  customerEmail: 'dana@example.com',
}

beforeEach(() => {
  resetSentNotifications()
  // The stub "delivers" by logging; silence it so the test output stays clean.
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/notifications/appointment-confirmation', () => {
  it('accepts a valid payload and records the confirmation', async () => {
    const res = await request(createApp()).post(URL).send(validPayload)

    expect(res.status).toBe(202)
    expect(res.body.status).toBe('accepted')
    expect(res.body.kind).toBe('appointment-confirmation')
    expect(res.body.appointmentId).toBe(validPayload.appointmentId)

    const sent = getSentNotifications()
    expect(sent).toHaveLength(1)
    expect(sent[0].customerName).toBe('Dana Levi')
  })

  it('accepts a payload with no customerEmail, since email is optional', async () => {
    const { customerEmail: _omitted, ...withoutEmail } = validPayload

    const res = await request(createApp()).post(URL).send(withoutEmail)

    expect(res.status).toBe(202)
    expect(getSentNotifications()[0].customerEmail).toBeUndefined()
  })

  it('never reflects the customer phone or email back in the response', async () => {
    const res = await request(createApp()).post(URL).send(validPayload)

    expect(JSON.stringify(res.body)).not.toContain(validPayload.customerPhone)
    expect(JSON.stringify(res.body)).not.toContain(validPayload.customerEmail)
  })

  it('stores a free-text customerName verbatim, without escaping or stripping it', async () => {
    const hostile = '<script>alert(1)</script> O\'Brien'

    const res = await request(createApp())
      .post(URL)
      .send({ ...validPayload, customerName: hostile })

    expect(res.status).toBe(202)
    expect(getSentNotifications()[0].customerName).toBe(hostile)
  })

  for (const field of ['appointmentId', 'serviceName', 'date', 'startTime', 'customerName', 'customerPhone']) {
    it(`rejects a payload missing "${field}" with 400 and sends nothing`, async () => {
      const body: Record<string, unknown> = { ...validPayload }
      delete body[field]

      const res = await request(createApp()).post(URL).send(body)

      expect(res.status).toBe(400)
      expect(res.body.error).toContain(field)
      expect(getSentNotifications()).toHaveLength(0)
    })
  }

  it('rejects a malformed customerEmail rather than silently dropping it', async () => {
    const res = await request(createApp())
      .post(URL)
      .send({ ...validPayload, customerEmail: 'not-an-email' })

    expect(res.status).toBe(400)
    expect(getSentNotifications()).toHaveLength(0)
  })

  it('rejects a non-uuid appointmentId', async () => {
    const res = await request(createApp())
      .post(URL)
      .send({ ...validPayload, appointmentId: 'abc' })

    expect(res.status).toBe(400)
  })

  it('rejects a date that matches the shape but is not a real calendar day', async () => {
    const res = await request(createApp())
      .post(URL)
      .send({ ...validPayload, date: '2026-02-31' })

    expect(res.status).toBe(400)
  })

  it('rejects an out-of-range startTime', async () => {
    const res = await request(createApp())
      .post(URL)
      .send({ ...validPayload, startTime: '25:61' })

    expect(res.status).toBe(400)
  })

  it('rejects an operator object in place of a string field', async () => {
    const res = await request(createApp())
      .post(URL)
      .send({ ...validPayload, customerName: { $ne: null } })

    expect(res.status).toBe(400)
    expect(getSentNotifications()).toHaveLength(0)
  })

  it('rejects a non-object JSON body', async () => {
    const res = await request(createApp())
      .post(URL)
      .set('Content-Type', 'application/json')
      .send('[]')

    expect(res.status).toBe(400)
  })

  it('emits no CORS headers — this route is server-to-server only', async () => {
    const res = await request(createApp())
      .post(URL)
      .set('Origin', 'http://evil.example.com')
      .send(validPayload)

    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('does not expose the recorded notifications over HTTP', async () => {
    await request(createApp()).post(URL).send(validPayload)

    const res = await request(createApp()).get('/api/notifications')

    expect(res.status).toBe(404)
  })
})
