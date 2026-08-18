import { describe, it, expect } from 'vitest'
import request from 'supertest'

import { createApp } from './app.ts'

describe('GET /health', () => {
  it('returns 200 with an ok status and requires no auth', async () => {
    const app = createApp()

    const res = await request(app).get('/health')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })

  it('succeeds even when an Authorization header is absent or invalid', async () => {
    const app = createApp()

    const res = await request(app).get('/health').set('Authorization', 'Bearer not-a-real-token')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })

  it('returns 404 for an unknown route', async () => {
    const app = createApp()

    const res = await request(app).get('/does-not-exist')

    expect(res.status).toBe(404)
  })
})
