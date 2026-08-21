import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import request from 'supertest'

import { createApp } from './app.ts'

// A stand-in for `frontend/dist`. The real one is a build artifact and is
// gitignored, so the tests must never depend on it having been built.
let distPath: string

const INDEX_HTML = '<!doctype html><html><head><title>SPA</title></head><body><div id="root"></div></body></html>'

beforeAll(() => {
  distPath = mkdtempSync(path.join(tmpdir(), 'gw-dist-'))
  writeFileSync(path.join(distPath, 'index.html'), INDEX_HTML)
  mkdirSync(path.join(distPath, 'assets'))
  writeFileSync(path.join(distPath, 'assets', 'app.js'), 'console.log("built")')
})

afterAll(() => {
  rmSync(distPath, { recursive: true, force: true })
})

const appWithFrontend = () => createApp({ serveFrontend: true, frontendDistPath: distPath })

describe('single-origin static serving (serveFrontend on)', () => {
  it('serves the built index.html at /', async () => {
    const res = await request(appWithFrontend()).get('/')

    expect(res.status).toBe(200)
    expect(res.text).toContain('<div id="root"></div>')
  })

  it('serves a hashed asset from dist/assets', async () => {
    const res = await request(appWithFrontend()).get('/assets/app.js')

    expect(res.status).toBe(200)
    expect(res.text).toContain('built')
  })

  it('falls back to index.html for a deep client-side route', async () => {
    const res = await request(appWithFrontend()).get('/admin/dashboard')

    expect(res.status).toBe(200)
    expect(res.text).toContain('<div id="root"></div>')
  })

  it('leaves /health untouched', async () => {
    const res = await request(appWithFrontend()).get('/health')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })

  it('still returns the JSON 404 for an unmatched /api route', async () => {
    const res = await request(appWithFrontend()).get('/api/unknown-route')

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Not Found' })
  })

  it('still fails closed with 401 on the JWT-gated admin mounts', async () => {
    const app = appWithFrontend()

    const services = await request(app).get('/api/services/all')
    const appointments = await request(app).get('/api/appointments')

    expect(services.status).toBe(401)
    expect(appointments.status).toBe(401)
  })

  it('does not answer a non-GET unmatched route with HTML', async () => {
    const res = await request(appWithFrontend()).post('/admin/dashboard')

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Not Found' })
  })
})

describe('single-origin static serving (serveFrontend off)', () => {
  it('behaves exactly as before — unknown route is a JSON 404', async () => {
    const app = createApp({ serveFrontend: false })

    const res = await request(app).get('/admin/dashboard')

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Not Found' })
  })

  it('boots and answers /health when the dist directory does not exist', async () => {
    const app = createApp({
      serveFrontend: true,
      frontendDistPath: path.join(tmpdir(), 'gw-dist-does-not-exist'),
    })

    const health = await request(app).get('/health')
    const missing = await request(app).get('/admin/dashboard')

    expect(health.status).toBe(200)
    expect(missing.status).toBe(404)
  })
})
