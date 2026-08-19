import { Loader2 } from 'lucide-react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useI18n } from '../hooks/useI18n'
import { useStore } from '../store/store'

export const ADMIN_LOGIN_ROUTE = '/admin/login'
export const ADMIN_HOME_ROUTE = '/admin'

/** Carried to the login page so signing in returns the Admin to where they were
 * actually headed, rather than always to the dashboard root. */
export interface FromLocationState {
  from?: string
}

/**
 * The guard every Admin screen sits behind (PRD AC-7). It is a convenience, not
 * a security boundary: the token it checks is never inspected here, and
 * api-gateway remains the only side that decides whether a request is allowed.
 * A tampered-with client can render the dashboard shell and will still be
 * answered 401 by every call it makes.
 *
 * The hydration wait matters more than it looks. The persisted token is read
 * from storage asynchronously, so for the first paint after a refresh the store
 * legitimately says "no token" — redirecting on that would sign the Admin out
 * on every reload. Rendering nothing but a loading notice until the session is
 * known is what makes a refresh survivable.
 */
export function ProtectedRoute() {
  const { t } = useI18n()
  const location = useLocation()

  const token = useStore((state) => state.token)
  const isHydratingAuth = useStore((state) => state.isHydratingAuth)

  if (isHydratingAuth) {
    return (
      <main
        id="main-content"
        className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-4 py-16"
      >
        <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
        <p role="status" className="text-sm text-neutral-900/70">
          {t('admin.checkingSession')}
        </p>
      </main>
    )
  }

  if (!token) {
    return (
      <Navigate
        to={ADMIN_LOGIN_ROUTE}
        replace
        state={{ from: location.pathname } satisfies FromLocationState}
      />
    )
  }

  return <Outlet />
}
