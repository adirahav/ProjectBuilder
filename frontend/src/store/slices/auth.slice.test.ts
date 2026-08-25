import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'
import { isAdmin } from '../../utils/auth.utils'
import type { AuthUser } from '../../types/auth.types'

/** State-transition tests for the auth slice. */

const USER: AuthUser = {
  id: 'u1',
  fullName: 'הילה כהן',
  email: 'hila@example.com',
  roles: ['user'],
}

describe('authSlice', () => {
  beforeEach(() => {
    useStore.getState().clearSession()
  })

  it('starts with no session', () => {
    expect(useStore.getState().currentUser).toBeNull()
    expect(useStore.getState().isAuthenticated).toBe(false)
  })

  it('sets the session from the server-returned user', () => {
    useStore.getState().setSession(USER)

    expect(useStore.getState().currentUser).toEqual(USER)
    expect(useStore.getState().isAuthenticated).toBe(true)
  })

  it('does not grant admin for a freshly signed-up session', () => {
    useStore.getState().setSession(USER)

    expect(isAdmin(useStore.getState().currentUser?.roles)).toBe(false)
  })

  it('derives admin only from the roles the server actually returned', () => {
    useStore.getState().setSession({ ...USER, roles: ['user', 'admin'] })

    expect(isAdmin(useStore.getState().currentUser?.roles)).toBe(true)
  })

  it('exposes isAdminSession derived from the returned roles', () => {
    useStore.getState().setSession(USER)
    expect(useStore.getState().isAdminSession).toBe(false)

    useStore.getState().setSession({ ...USER, roles: ['user', 'admin'] })
    expect(useStore.getState().isAdminSession).toBe(true)
  })

  it('clears the session back to the signed-out state', () => {
    useStore.getState().setSession({ ...USER, roles: ['admin'] })

    useStore.getState().clearSession()

    expect(useStore.getState().currentUser).toBeNull()
    expect(useStore.getState().isAuthenticated).toBe(false)
    expect(useStore.getState().isAdminSession).toBe(false)
  })
})
