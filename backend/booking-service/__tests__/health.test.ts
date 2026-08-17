import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../api/app.js'

describe('GET /health', () => {
	it('returns 200 with { status: "ok" } and requires no auth', async () => {
		const app = createApp()

		const res = await request(app).get('/health')

		expect(res.status).toBe(200)
		expect(res.body).toEqual({ status: 'ok' })
	})

	it('does not require a database connection', async () => {
		// createApp() never calls connectDB(), so a 200 here proves the health
		// route is independent of Mongo — the whole point of the check.
		const app = createApp()

		const res = await request(app).get('/health')

		expect(res.status).toBe(200)
	})
})

describe('unknown routes', () => {
	it('returns a clean 404 JSON error shape', async () => {
		const app = createApp()

		const res = await request(app).get('/api/does-not-exist')

		expect(res.status).toBe(404)
		expect(res.body).toEqual({ error: 'Not found' })
	})
})
