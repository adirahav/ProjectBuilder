import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

import { AdminLoginForm } from '../components/admin/AdminLoginForm'
import { PageHeader } from '../components/common/PageHeader'
import { useI18n } from '../hooks/useI18n'
import { useStore } from '../store/store'
import { translate } from '../i18n/strings'
import { cn } from '../lib/utils'
import { ADMIN_HOME_ROUTE, type FromLocationState } from '../components/ProtectedRoute'
import type { AdminCredentials } from '../types/auth.types'

/**
 * Screen 5 — Admin Login (PRD F5). The only login in the system: a Customer has
 * no account and never sees this page.
 *
 * Two decisions worth stating:
 *
 * 1. Rejected credentials render as an inline, `role="alert"` message rather
 *    than a toast. A 401 here is not a session expiry and not an infrastructure
 *    fault — it is the expected answer to a wrong password, it belongs beside
 *    the form that caused it, and it must stay on screen while the Admin
 *    retypes rather than fading out after a few seconds. Genuine failures
 *    (network, a broken gateway) still use a toast, as everywhere else
 *    (.rule/error-handling-rules.md).
 * 2. The message never says *which* half was wrong. user-service answers
 *    generically on purpose so an attacker cannot use this form to discover
 *    whether an account exists, and the UI must not undo that.
 */
export function AdminLoginPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()

  const token = useStore((state) => state.token)
  const isLoggingIn = useStore((state) => state.isLoggingIn)
  const login = useStore((state) => state.login)

  const [hasInvalidCredentials, setHasInvalidCredentials] = useState(false)

  // Where ProtectedRoute turned the Admin away from, so signing in returns them
  // to what they were actually after instead of always dumping them on /admin.
  const from = (location.state as FromLocationState | null)?.from

  // Already signed in: this page has nothing to offer, and leaving it reachable
  // would let a stale form overwrite a live session.
  if (token) return <Navigate to={from ?? ADMIN_HOME_ROUTE} replace />

  const handleSubmit = async (credentials: AdminCredentials) => {
    setHasInvalidCredentials(false)

    const outcome = await login(credentials)
    // Read at completion time rather than closed over, so switching language
    // mid-request cannot show a message in the language that was active when
    // the request left.
    const { locale: activeLocale } = useStore.getState()

    if (outcome === 'success') {
      toast.success(translate(activeLocale, 'adminLogin.success.toast'))
      navigate(from ?? ADMIN_HOME_ROUTE, { replace: true })
      return
    }

    if (outcome === 'invalidCredentials') {
      setHasInvalidCredentials(true)
      return
    }

    toast.error(translate(activeLocale, 'adminLogin.error.toast'))
  }

  return (
    <main id="main-content" className="mx-auto w-full max-w-md px-4 py-10 md:py-16">
      <div className="flex flex-col gap-6 rounded-2xl border border-neutral-900/10 bg-white p-6 shadow-sm md:p-8">
        <span className="flex size-12 items-center justify-center rounded-xl bg-primary-light text-primary">
          <ShieldCheck className="size-6" aria-hidden="true" />
        </span>

        <PageHeader title={t('adminLogin.title')} subtitle={t('adminLogin.subtitle')} />

        {hasInvalidCredentials && (
          <div
            role="alert"
            className={cn(
              'flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10',
              'px-4 py-3 text-start text-sm text-danger',
            )}
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {/* Words carry the meaning; the colour and icon only reinforce it. */}
              <span className="font-semibold">{t('adminLogin.invalid.title')}</span>{' '}
              {t('adminLogin.invalid.body')}
            </span>
          </div>
        )}

        <AdminLoginForm isSubmitting={isLoggingIn} onSubmit={(c) => void handleSubmit(c)} />
      </div>

      <Link
        to="/"
        className={cn(
          'mt-6 inline-flex items-center gap-2 rounded-xl px-4 py-2.5',
          'text-sm font-semibold text-primary transition-colors hover:bg-primary-light',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        )}
      >
        {/* Points back toward the previous screen in both directions. */}
        <ArrowRight className="size-4 shrink-0 rotate-180 rtl:rotate-0" aria-hidden="true" />
        {t('adminLogin.back')}
      </Link>
    </main>
  )
}
