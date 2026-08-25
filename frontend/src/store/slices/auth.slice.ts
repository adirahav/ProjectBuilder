import type { SliceCreator } from '../store'
import type { AuthUser } from '../../types/auth.types'
import { isAdmin } from '../../utils/auth.utils'

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
  /**
   * Whether the current session carries admin permissions. Derived from the
   * `roles` the server actually returned — never set independently, so no code
   * path can mark a session admin without the server saying so.
   */
  isAdminSession: boolean
  setSession: (user: AuthUser) => void
  clearSession: () => void
}

export const createAuthSlice: SliceCreator<AuthSlice> = (set) => ({
  currentUser: null,
  isAuthenticated: false,
  isAdminSession: false,

  setSession: (user) =>
    set({ currentUser: user, isAuthenticated: true, isAdminSession: isAdmin(user.roles) }),
  clearSession: () => set({ currentUser: null, isAuthenticated: false, isAdminSession: false }),
})
