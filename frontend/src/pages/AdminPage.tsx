import { useNavigate } from 'react-router-dom'
import { LayoutDashboard, LogOut, ShieldAlert } from 'lucide-react'
import { authService } from '../services/auth.service'
import { useStore } from '../store/store'

/**
 * Screen 4 — Admin Dashboard. Placeholder only.
 *
 * Exists so the successful-login redirect has a real destination instead of
 * 404-ing (plan 006, Open Question 4). The dashboard tabs (seat management,
 * tours & buses, manifest) are built by Screen 4's own ticket.
 *
 * This is NOT an auth guard — protected routing is explicitly out of scope for
 * plan 006. It only renders an honest empty state when reached without an admin
 * session, rather than implying an authenticated context that doesn't exist.
 */
export function AdminPage() {
  const navigate = useNavigate()
  const currentUser = useStore((state) => state.currentUser)
  const isAdminSession = useStore((state) => state.isAdminSession)

  async function handleLogout() {
    await authService.logout()
    navigate('/', { replace: true })
  }

  if (!isAdminSession) {
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

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-[420px] flex-col items-center gap-4 rounded-xl border border-n-100 bg-n-0 p-6 text-center shadow-sm">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary-100 text-primary-700">
          <LayoutDashboard aria-hidden="true" className="size-6" />
        </span>
        <h1 className="text-h1 text-primary-900">אזור הניהול</h1>
        <p className="text-body text-n-500">
          שלום {currentUser?.fullName}, ההתחברות הצליחה. לוח הניהול ייבנה בכרטיס הבא.
        </p>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-n-200 bg-n-0 text-label font-medium text-n-700 transition hover:bg-n-50"
        >
          <LogOut aria-hidden="true" className="size-4" />
          התנתקות
        </button>
      </div>
    </main>
  )
}
