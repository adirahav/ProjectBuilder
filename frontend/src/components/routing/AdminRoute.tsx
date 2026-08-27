import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { useStore } from '../../store/store'

/**
 * Route wrapper for admin-only pages (plan 009, Step 1 / Open Question 1).
 *
 * Extracted from the guard that used to be inlined in `AdminPage.tsx` so a
 * second admin-only page (e.g. bus-type template management) does not have to
 * repeat it. Named `AdminRoute` rather than `RequireAdmin` to match the router
 * guard convention in .rule/naming-rules.md (`<Name>Route.tsx`), which the rules
 * make authoritative over the plan's working title.
 *
 * **This is a UX guard, not a security boundary.** `isAdminSession` is derived
 * from the roles the server returned, but it lives in client memory and can be
 * trivially forged in a browser console. Real authorization is enforced per
 * request by the admin JWT middleware on `tour-service` — every admin-only
 * endpoint must reject a missing/invalid/non-admin token on its own, with no
 * reference to whether this component rendered.
 *
 * It renders an honest signed-out state rather than redirecting, so an admin who
 * lands here with an expired session sees why instead of being bounced with no
 * explanation. (`http.service.ts` already handles the redirect for a session
 * that expires mid-request.)
 */
type AdminRouteProps = {
  children: ReactNode
}

export function AdminRoute({ children }: AdminRouteProps) {
  const navigate = useNavigate()
  const isAdminSession = useStore((state) => state.isAdminSession)

  if (isAdminSession) return <>{children}</>

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-[420px] flex-col items-center gap-4 rounded-xl border border-n-100 bg-n-0 p-6 text-center shadow-sm">
        <span className="flex size-12 items-center justify-center rounded-full bg-warning-50 text-warning-600">
          <ShieldAlert aria-hidden="true" className="size-6" />
        </span>
        <h1 className="text-h1 text-primary-900">נדרשת התחברות כמנהל</h1>
        <p className="text-body text-n-500">
          האזור הזה זמין למנהלים בלבד. התחברו ממסך הכניסה כדי להמשיך.
        </p>
        <button
          type="button"
          onClick={() => navigate('/', { replace: true })}
          className="mt-2 h-10 w-full rounded-lg bg-primary-700 text-label font-medium text-n-0 transition hover:bg-primary-900"
        >
          למסך הכניסה
        </button>
      </div>
    </main>
  )
}
