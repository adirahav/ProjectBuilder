import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createApp } from '../api/app.js'

const app = createApp()

describe('GET /health', () => {
  it('returns 200 without any Authorization header', async () => {
    const res = await request(app).get('/health')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })
})
