import { describe, expect, it } from 'vitest'

import {
  decideBackButtonAction,
  EXIT_PROMPT_WINDOW_MS,
  isRootRoute,
  PUBLIC_HOME_ROUTE,
  type BackButtonContext,
} from './backButtonLogic'

const NOW = 1_700_000_000_000

/** A signed-out Customer sitting on the public home page, no modal, no prompt. */
function contextOf(overrides: Partial<BackButtonContext> = {}): BackButtonContext {
  return {
    pathname: PUBLIC_HOME_ROUTE,
    isAuthenticated: false,
    isModalOpen: false,
    lastExitPromptAt: null,
    now: NOW,
    ...overrides,
  }
}

describe('isRootRoute', () => {
  it('treats the public service list as a root for everyone', () => {
    expect(isRootRoute('/', false)).toBe(true)
    expect(isRootRoute('/', true)).toBe(true)
  })

  it('treats the admin dashboard as a root only once a session is live', () => {
    expect(isRootRoute('/admin', true)).toBe(true)
    expect(isRootRoute('/admin', false)).toBe(false)
  })

  it('ignores a trailing slash from a deep link', () => {
    expect(isRootRoute('/admin/', true)).toBe(true)
  })

  it('does not treat admin sub-screens as roots', () => {
    expect(isRootRoute('/admin/appointments', true)).toBe(false)
    expect(isRootRoute('/admin/services', true)).toBe(false)
  })
})

describe('decideBackButtonAction — modal-first dismissal', () => {
  it('closes an open modal instead of navigating, on a linear screen', () => {
    const action = decideBackButtonAction(
      contextOf({ pathname: '/admin/appointments', isAuthenticated: true, isModalOpen: true }),
    )

    expect(action).toEqual({ type: 'closeModal' })
  })

  it('closes an open modal instead of offering to exit, on a root screen', () => {
    // The root/exit branch is the one a missed modal would fall into most
    // destructively — a dialog press must never start the exit sequence.
    const action = decideBackButtonAction(contextOf({ pathname: '/', isModalOpen: true }))

    expect(action).toEqual({ type: 'closeModal' })
  })

  it('closes an open modal even when an exit prompt is already pending', () => {
    const action = decideBackButtonAction(
      contextOf({ isModalOpen: true, lastExitPromptAt: NOW - 500 }),
    )

    expect(action).toEqual({ type: 'closeModal' })
  })

  it('closes an open modal on the login screen rather than leaving for home', () => {
    const action = decideBackButtonAction(
      contextOf({ pathname: '/admin/login', isModalOpen: true }),
    )

    expect(action).toEqual({ type: 'closeModal' })
  })
})

describe('decideBackButtonAction — root screens and double-press exit', () => {
  it('warns rather than exits on the first press on the public root', () => {
    const action = decideBackButtonAction(contextOf({ pathname: '/' }))

    expect(action).toEqual({ type: 'promptExit' })
  })

  it('warns rather than exits on the first press on the authenticated admin root', () => {
    const action = decideBackButtonAction(
      contextOf({ pathname: '/admin', isAuthenticated: true }),
    )

    expect(action).toEqual({ type: 'promptExit' })
  })

  it('backgrounds the app on a second press inside the two-second window', () => {
    const action = decideBackButtonAction(
      contextOf({ lastExitPromptAt: NOW - (EXIT_PROMPT_WINDOW_MS - 1) }),
    )

    expect(action).toEqual({ type: 'exitApp' })
  })

  it('backgrounds the app on a press exactly at the window boundary', () => {
    const action = decideBackButtonAction(
      contextOf({ lastExitPromptAt: NOW - EXIT_PROMPT_WINDOW_MS }),
    )

    expect(action).toEqual({ type: 'exitApp' })
  })

  it('re-arms the warning instead of exiting once the window has passed', () => {
    // A press a minute later is a fresh intent, not the second half of a
    // double-press — exiting there would be the accidental exit this exists to
    // prevent.
    const action = decideBackButtonAction(
      contextOf({ lastExitPromptAt: NOW - (EXIT_PROMPT_WINDOW_MS + 1) }),
    )

    expect(action).toEqual({ type: 'promptExit' })
  })

  it('runs the exit sequence from the admin root too, not history popping', () => {
    const action = decideBackButtonAction(
      contextOf({
        pathname: '/admin',
        isAuthenticated: true,
        lastExitPromptAt: NOW - 100,
      }),
    )

    expect(action).toEqual({ type: 'exitApp' })
  })
})

describe('decideBackButtonAction — linear screens', () => {
  const linearRoutes = [
    '/book/svc-1',
    '/book/svc-1/details',
    '/book/svc-1/confirmation',
    '/book/svc-1/confirmation/appt-9',
  ]

  it.each(linearRoutes)('steps back one level from %s', (pathname) => {
    expect(decideBackButtonAction(contextOf({ pathname }))).toEqual({ type: 'navigateBack' })
  })

  it.each(['/admin/appointments', '/admin/services'])(
    'steps back one level from %s while signed in',
    (pathname) => {
      const action = decideBackButtonAction(contextOf({ pathname, isAuthenticated: true }))

      expect(action).toEqual({ type: 'navigateBack' })
    },
  )

  it('steps back from an unrecognised route rather than doing nothing', () => {
    const action = decideBackButtonAction(contextOf({ pathname: '/somewhere-unknown' }))

    expect(action).toEqual({ type: 'navigateBack' })
  })
})

describe('decideBackButtonAction — auth-driven branching', () => {
  it('leaves the login screen for the public home page, not app exit', () => {
    const action = decideBackButtonAction(contextOf({ pathname: '/admin/login' }))

    expect(action).toEqual({ type: 'navigateTo', path: PUBLIC_HOME_ROUTE })
  })

  it('still leaves the login screen for home when a session somehow exists', () => {
    // AdminLoginPage redirects an already-signed-in Admin away, but the press
    // could land in that same tick; home is the safe answer either way.
    const action = decideBackButtonAction(
      contextOf({ pathname: '/admin/login', isAuthenticated: true }),
    )

    expect(action).toEqual({ type: 'navigateTo', path: PUBLIC_HOME_ROUTE })
  })

  it.each(['/admin', '/admin/services', '/admin/appointments'])(
    'reads %s without a token as the login screen and goes home',
    (pathname) => {
      // A mid-session 401 clears the token; ProtectedRoute is already
      // redirecting to /admin/login, so back must not pop into a guarded route
      // that would only bounce the Admin straight back again.
      const action = decideBackButtonAction(contextOf({ pathname, isAuthenticated: false }))

      expect(action).toEqual({ type: 'navigateTo', path: PUBLIC_HOME_ROUTE })
    },
  )

  it('never returns a no-op action for any covered route', () => {
    const routes = [
      '/',
      '/admin',
      '/admin/login',
      '/admin/services',
      '/admin/appointments',
      '/book/svc-1',
      '/book/svc-1/details',
      '/book/svc-1/confirmation/appt-9',
    ]

    for (const pathname of routes) {
      for (const isAuthenticated of [true, false]) {
        const action = decideBackButtonAction(contextOf({ pathname, isAuthenticated }))
        expect(action.type).toBeDefined()
      }
    }
  })
})
