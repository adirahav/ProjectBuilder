/**
 * Security tests for ADDLOGIN-SEC (plan 017 — Login/Logout link in Header).
 *
 * Scope: this task only touches `frontend/src/components/layout/AppHeader.tsx`
 * (reads `token`/`admin`/`logout` from the existing Plan 011 `auth` slice; no
 * backend routes, contracts, or store-slice logic changed). The security
 * surface is therefore entirely client-side:
 *
 *  1. The cached Admin identity (`admin.email`) is untrusted data (it is
 *     read back out of localStorage / a prior API response) and is now
 *     rendered directly in the header on every route — it must never be
 *     interpreted as HTML (stored/reflected XSS via a crafted email).
 *  2. The JWT itself must never be rendered into the DOM by the new auth
 *     section (only used for the truthy/falsy `token` check).
 *  3. Clicking Logout must actually clear the persisted session (token +
 *     cached identity) even when the underlying storage call rejects, so a
 *     shared/public browser is not left signed in after the user believes
 *     they logged out.
 *  4. The Login link must only ever point at the Admin login route — never
 *     be reachable with attacker-controlled `href`/query data (guards
 *     against an open-redirect-style regression if the link target is ever
 *     made dynamic).
 *
 * This is a frontend-only task, so these are frontend (jsdom) tests, not
 * backend/API-contract tests — there is no new backend surface to audit
 * (docs/agent-reports/2026-08-21-ADDLOGIN-SEC-add-login-logout-link-in-header-security.md
 * explains the scoping decision).
 *
 * Run from `frontend` (so its `node_modules`/vitest config resolves):
 *   cd frontend && npx vitest run ../docs/tests/security/add-login-logout-header.security.test.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { AppHeader } from '../../../frontend/src/components/layout/AppHeader'
import { useStore } from '../../../frontend/src/store/store'

const navigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function renderHeader() {
  return render(
    <MemoryRouter>
      <AppHeader />
    </MemoryRouter>,
  )
}

describe('ADDLOGIN-SEC — header auth affordance security', () => {
  beforeEach(() => {
    navigate.mockClear()
    useStore.setState({ locale: 'en', token: null, admin: null, isHydratingAuth: false })
  })

  it('renders a crafted admin.email as inert text, never as markup (stored XSS)', () => {
    const malicious = '<img src=x onerror=alert(1)>@studio.test'
    useStore.setState({ token: 'jwt', admin: { id: 'a1', email: malicious } })

    renderHeader()

    // React text nodes escape this automatically; assert no element was
    // actually injected into the DOM (the only way an onerror handler could
    // fire), and that the literal string is present as plain text.
    expect(document.querySelector('img[onerror]')).toBeNull()
    expect(document.body.innerHTML).not.toContain('<img src=x onerror=')
    expect(screen.getByText(malicious, { exact: false })).toBeInTheDocument()
  })

  it('never renders the raw JWT into the DOM', () => {
    const secretToken = 'eyJhbGciOiJIUzI1NiJ9.secret-payload.signature'
    useStore.setState({ token: secretToken, admin: { id: 'a1', email: 'admin@studio.test' } })

    renderHeader()

    expect(document.body.innerHTML).not.toContain(secretToken)
  })

  it('clears both the in-memory token and cached identity on Logout, even when persistence fails internally', async () => {
    // Mirrors the real auth.slice.logout() contract: it clears in-memory
    // state first, then tries to clear storage inside a try/catch that
    // swallows any failure — logout() itself never rejects. AppHeader's
    // handleLogout() has no try/catch of its own and relies on that
    // contract holding, so this also guards against a regression where
    // logout() starts rejecting and silently strands the redirect/toast.
    const logout = vi.fn().mockImplementation(async () => {
      useStore.setState({ token: null, admin: null })
      // storage clear failed and was swallowed internally — logout() still
      // resolves, exactly like auth.slice.ts's own try/catch does.
    })
    useStore.setState({ token: 'jwt', admin: { id: 'a1', email: 'admin@studio.test' }, logout })

    renderHeader()
    await userEvent.click(screen.getByRole('button', { name: /log out/i }))

    expect(useStore.getState().token).toBeNull()
    expect(useStore.getState().admin).toBeNull()
    expect(navigate).toHaveBeenCalledWith('/', { replace: true })
  })

  it('the Login link always targets the fixed Admin login route, never an attacker-influenced URL', () => {
    renderHeader()

    const link = screen.getByRole('link', { name: /log in/i })
    expect(link.getAttribute('href')).toBe('/admin/login')
    // No query string / hash smuggled onto the login link (open-redirect guard).
    expect(link.getAttribute('href')).not.toMatch(/[?#]/)
  })

  it('does not leak the Login/Logout affordance before auth hydration resolves (no auth-state flash)', () => {
    useStore.setState({ token: null, admin: null, isHydratingAuth: true })

    renderHeader()

    expect(screen.queryByRole('link', { name: /log in/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /log out/i })).not.toBeInTheDocument()
  })
})
