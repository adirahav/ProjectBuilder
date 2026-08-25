import type { SliceCreator } from '../store'
import type { AuthUser } from '../../types/auth.types'

/**
 * Session state for the authenticated account.
 *
 * Written by `auth.service.ts` after an API response — components must not
 * duplicate that update after calling the service (.rule/coding-rules.md).
 *
 * A signed-up account always has `roles: ["user"]`; `isAdmin` is derived from
 * the roles the server actually returned, never assumed from "we just signed
 * up successfully" (PRD F2b / AC-2).
 */
export type AuthSlice = {
  currentUser: AuthUser | null
  isAuthenticated: boolean
  setSession: (user: AuthUser) => void
  clearSession: () => void
}

export const createAuthSlice: SliceCreator<AuthSlice> = (set) => ({
  currentUser: null,
  isAuthenticated: false,

  setSession: (user) => set({ currentUser: user, isAuthenticated: true }),
  clearSession: () => set({ currentUser: null, isAuthenticated: false }),
})
