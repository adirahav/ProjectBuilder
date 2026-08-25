import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Bus, KeyRound, Ticket } from 'lucide-react'
import { AdminLoginModal } from '../components/auth/AdminLoginModal'

/**
 * Screen 1 — Gateway. The app's entry point, mirroring
 * docs/design/mockups/gateway-login.html.
 *
 * Two mutually exclusive entries:
 * - "Continue as passenger" — the single accent CTA on this screen
 *   (design-notes: at most one accent button per screen). No auth, no modal:
 *   straight to the tour/bus selection (Screen 3).
 * - "Admin login" — secondary button opening the login modal in place. Only a
 *   successful login navigates anywhere.
 *
 * `←` arrows point inline-end; in this RTL layout that is `ArrowLeft`, and the
 * icons are `aria-hidden` since the button text already carries the meaning.
 */

/** Screen 3 — tour/bus selection + seat map. */
const PASSENGER_ROUTE = '/tours'
/** Screen 4 — admin dashboard, reached only after a successful admin login. */
const ADMIN_ROUTE = '/admin'

export function GatewayPage() {
  const navigate = useNavigate()
  const [isLoginOpen, setIsLoginOpen] = useState(false)

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-xl bg-accent-500 text-n-0 shadow-md">
          <Bus aria-hidden="true" className="size-7" />
        </span>
        <h1 className="text-display text-primary-900">הילה טיולים</h1>
        <p className="mt-2 text-body text-n-500">ניהול מושבים באוטובוסי טיולים — בזמן אמת</p>
      </div>

      <div className="w-full max-w-[420px] rounded-xl border border-n-100 bg-n-0 p-6 shadow-sm">
        <h2 className="text-h2 text-primary-900">איך תרצו להיכנס?</h2>
        <p className="mt-2 text-label text-n-500">נוסעים נכנסים ללא הרשמה. מנהלים נדרשים להתחבר.</p>

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => navigate(PASSENGER_ROUTE)}
            className="flex w-full items-center justify-between rounded-lg bg-accent-500 px-4 py-3 text-body font-semibold text-n-0 transition hover:brightness-95"
          >
            <span className="flex items-center gap-2">
              <Ticket aria-hidden="true" className="size-5" />
              המשך כנוסע
            </span>
            <ArrowLeft aria-hidden="true" className="size-5" />
          </button>
          <p className="-mt-1 text-caption text-n-400">
            מעבר ישיר לבחירת טיול ואוטובוס ולמפת המושבים.
          </p>

          <div className="my-2 flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-n-100" />
            <span className="text-caption text-n-400">או</span>
            <span className="h-px flex-1 bg-n-100" />
          </div>

          <button
            type="button"
            onClick={() => setIsLoginOpen(true)}
            className="flex w-full items-center justify-between rounded-lg border border-n-200 bg-n-0 px-4 py-3 text-body font-medium text-n-700 transition hover:bg-n-50"
          >
            <span className="flex items-center gap-2">
              <KeyRound aria-hidden="true" className="size-5" />
              כניסת מנהל
            </span>
            <ArrowLeft aria-hidden="true" className="size-5" />
          </button>
        </div>

        <p className="mt-6 text-center text-label text-n-500">
          אין לכם חשבון מנהל?
          <Link
            to="/signup"
            className="ms-1 font-medium text-primary-700 underline underline-offset-2 hover:text-primary-900"
          >
            הרשמה
          </Link>
        </p>
      </div>

      <p className="mt-8 max-w-[420px] text-center text-caption text-n-400">
        חשבון חדש נוצר תמיד עם הרשאת <span className="numeral">user</span> בלבד. הרשאות ניהול
        מוענקות על ידי מנהל קיים.
      </p>

      <AdminLoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onSuccess={() => {
          setIsLoginOpen(false)
          navigate(ADMIN_ROUTE, { replace: true })
        }}
      />
    </main>
  )
}
