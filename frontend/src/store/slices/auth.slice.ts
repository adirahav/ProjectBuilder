import type { StateCreator } from 'zustand'

import {
  authService,
  isDuplicateEmailError,
  isInvalidCredentialsError,
} from '../../services/auth.service'
import { utilService } from '../../services/util.service'
import type {
  AdminCredentials,
  AdminIdentity,
  CreateStaffAccountOutcome,
  LoginOutcome,
  StaffAccount,
  StaffAccountDraft,
} from '../../types/auth.types'
import type { RootState } from '../store'

/** Where the Admin's identity is cached. The token itself lives under
 * `AUTH_TOKEN_KEY`, owned by http.service — it is the only thing the transport
 * layer needs, and it must be readable without loading the store. */
export const ADMIN_STORAGE_KEY = 'admin'

export interface AuthSlice {
  /** The Admin's JWT, or null when nobody is signed in. */
  token: string | null
  /** Who is signed in. Cached alongside the token purely to greet them by name. */
  admin: AdminIdentity | null
  /** True while the login request is in flight — blocks a double submit. */
  isLoggingIn: boolean
  /**
   * True until the persisted session has been read from storage. ProtectedRoute
   * waits on this: without it, the first paint after a refresh always looks
   * signed-out and would bounce a perfectly valid session to the login page.
   */
  isHydratingAuth: boolean

  /** True while a staff account is being created — blocks a double submit that
   * would otherwise try to create the same account twice. */
  isCreatingStaffAccount: boolean
  /**
   * The most recently created staff account, or null. Kept so Screen 8 can name
   * the account it just made in its confirmation. It is not a list: v1 has no
   * "list all Admins" endpoint, and inventing a local one here would show a
   * roster that is only ever as complete as this browser tab's history.
   */
  createdStaffAccount: StaffAccount | null

  /**
   * Exchanges credentials for a JWT and stores it. Resolves to an outcome
   * instead of throwing, because wrong credentials are an ordinary result of a
   * login form, not a failure.
   */
  login: (credentials: AdminCredentials) => Promise<LoginOutcome>
  /** Clears the session — client-side only, there is no server-side revocation. */
  logout: () => Promise<void>
  /** Restores a persisted session on boot. */
  hydrateAuth: () => Promise<void>
  /**
   * Creates another Admin/staff account (PRD F12). Resolves to an outcome
   * instead of throwing, because "that email is already taken" is an ordinary
   * result of this form, not a failure of the system.
   *
   * It never touches `token`/`admin`: creating an account for someone else must
   * not sign the current Admin out of, or into, anything.
   */
  createStaffAccount: (draft: StaffAccountDraft) => Promise<CreateStaffAccountOutcome>
  /** Clears the confirmation, so re-opening Screen 8 does not greet the Admin
   * with a success message about an account they created some time ago. */
  clearCreatedStaffAccount: () => void
  /**
   * Drops the in-memory session without touching storage. Called by
   * http.service's 401 handler, which has already cleared the stored token.
   */
  clearSession: () => void
}

export const createAuthSlice: StateCreator<RootState, [], [], AuthSlice> = (set, get) => ({
  token: null,
  admin: null,
  isLoggingIn: false,
  isHydratingAuth: true,
  isCreatingStaffAccount: false,
  createdStaffAccount: null,

  login: async (credentials) => {
    if (get().isLoggingIn) return 'error'

    set({ isLoggingIn: true })

    try {
      const { token, admin } = await authService.login(credentials)

      // Persist first, then publish: a session that is live in memory but was
      // never written would silently evaporate on the next refresh.
      await authService.saveToken(token)
      await utilService.saveToStorage(ADMIN_STORAGE_KEY, admin).catch(() => {
        // The identity is a nicety; the token is the session. Losing the cache
        // must never fail a successful login.
        console.log('[AUTH] could not cache the admin identity')
      })

      set({ token, admin })
      return 'success'
    } catch (err) {
      const isInvalid = isInvalidCredentialsError(err)
      console.log(
        isInvalid ? '[AUTH] login rejected: invalid credentials' : '[AUTH] the login request failed',
      )

      // Never leave a half-signed-in state behind: a failed attempt is signed
      // out, whatever the reason for the failure was.
      set({ token: null, admin: null })
      return isInvalid ? 'invalidCredentials' : 'error'
    } finally {
      set({ isLoggingIn: false })
    }
  },

  logout: async () => {
    // The confirmation goes with the session: it names another person's account
    // and has no business surviving into whoever signs in next.
    set({ token: null, admin: null, createdStaffAccount: null })

    try {
      await authService.clearToken()
      await utilService.removeFromStorage(ADMIN_STORAGE_KEY)
    } catch {
      console.log('[AUTH] could not clear the persisted session')
    }
  },

  hydrateAuth: async () => {
    try {
      const token = await authService.readToken()
      if (token) {
        const admin = await utilService.getFromStorage<AdminIdentity>(ADMIN_STORAGE_KEY)
        set({ token, admin: admin ?? null })
      }
    } catch {
      console.log('[AUTH] could not read the persisted session')
    } finally {
      set({ isHydratingAuth: false })
    }
  },

  createStaffAccount: async (draft) => {
    if (get().isCreatingStaffAccount) return 'error'

    // The previous confirmation goes now rather than on success: leaving it up
    // while the next request is in flight would show a stale "created" message
    // beside a form that is busy creating something else.
    set({ isCreatingStaffAccount: true, createdStaffAccount: null })

    try {
      const { admin } = await authService.registerAdmin(draft)

      // Only the account's public fields ever reach the store. The password was
      // never lifted out of the form, and the server does not send it back.
      set({ createdStaffAccount: admin })
      console.log('[AUTH] a staff account was created')
      return 'success'
    } catch (err) {
      const isDuplicate = isDuplicateEmailError(err)
      console.log(
        isDuplicate
          ? '[AUTH] staff account rejected: that email already has an account'
          : '[AUTH] creating the staff account failed',
      )

      return isDuplicate ? 'duplicateEmail' : 'error'
    } finally {
      set({ isCreatingStaffAccount: false })
    }
  },

  clearCreatedStaffAccount: () => {
    if (!get().createdStaffAccount) return
    set({ createdStaffAccount: null })
  },

  clearSession: () => {
    if (!get().token && !get().admin) return

    console.log('[AUTH] session ended')
    set({ token: null, admin: null, createdStaffAccount: null })
  },
})
