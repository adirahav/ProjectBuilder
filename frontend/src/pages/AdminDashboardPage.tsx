import { ArrowRight, CalendarClock, LogOut, Scissors } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { PageHeader } from '../components/common/PageHeader'
import { useI18n } from '../hooks/useI18n'
import { useStore } from '../store/store'
import { translate } from '../i18n/strings'
import { cn } from '../lib/utils'
import { ADMIN_LOGIN_ROUTE } from '../components/ProtectedRoute'

/**
 * The Admin dashboard: a shell that hands off to the screens that do the real
 * work. Services (F6-F8) is live; Appointments (F9-F11) is a separate ticket and
 * is shown as an unreachable, plainly-labelled card rather than a link that
 * would only dead-end.
 *
 * It carries one piece of behaviour of its own: sign-out. Logout is purely
 * client-side in v1 — the stored token is dropped, but there is no server-side
 * revocation, so the token remains technically valid until it expires.
 */
export function AdminDashboardPage() {
  const { t } = useI18n()
  const navigate = useNavigate()

  const admin = useStore((state) => state.admin)
  const logout = useStore((state) => state.logout)

  const handleLogout = async () => {
    await logout()
    toast.success(translate(useStore.getState().locale, 'admin.logout.toast'))
    navigate(ADMIN_LOGIN_ROUTE, { replace: true })
  }

  return (
    <main id="main-content" className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 md:mb-8">
        <PageHeader title={t('admin.dashboard.title')} subtitle={t('admin.dashboard.subtitle')} />

        <div className="flex flex-col items-start gap-2">
          {admin?.email && (
            <p className="text-sm text-neutral-900/70">
              {t('admin.signedInAs', { email: admin.email })}
            </p>
          )}

          <button
            type="button"
            onClick={() => void handleLogout()}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl border border-neutral-900/15 px-4 py-2.5',
              'text-sm font-semibold text-neutral-900 transition-colors hover:bg-primary-light',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            )}
          >
            <LogOut className="size-4 shrink-0 rtl:-scale-x-100" aria-hidden="true" />
            {t('admin.logout')}
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          to="/admin/services"
          className={cn(
            'flex flex-col gap-3 rounded-2xl border border-neutral-900/10 bg-white p-6 text-start',
            'transition-colors hover:border-primary/40 hover:bg-primary-light',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          )}
        >
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary-light text-primary">
            <Scissors className="size-5" aria-hidden="true" />
          </span>
          <h2 className="text-lg font-semibold text-neutral-900">
            {t('admin.dashboard.services.title')}
          </h2>
          <p className="text-sm text-neutral-900/70">{t('admin.dashboard.services.body')}</p>
          <span className="mt-auto inline-flex items-center gap-2 pt-2 text-sm font-semibold text-primary">
            {t('admin.dashboard.services.action')}
            <ArrowRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
          </span>
        </Link>

        <div
          className={cn(
            'flex flex-col gap-3 rounded-2xl border border-dashed border-neutral-900/15',
            'bg-white p-6 text-start',
          )}
        >
          <span className="flex size-11 items-center justify-center rounded-xl bg-neutral-900/5 text-neutral-900/60">
            <CalendarClock className="size-5" aria-hidden="true" />
          </span>
          <h2 className="text-lg font-semibold text-neutral-900">
            {t('admin.dashboard.appointments.title')}
          </h2>
          <p className="text-sm text-neutral-900/70">{t('admin.dashboard.appointments.body')}</p>
          {/* A word, not a greyed-out link: nothing here is clickable yet, and
              pretending otherwise only costs a wasted press. */}
          <span className="mt-auto pt-2 text-sm font-semibold text-neutral-900/60">
            {t('admin.dashboard.appointments.soon')}
          </span>
        </div>
      </div>
    </main>
  )
}
