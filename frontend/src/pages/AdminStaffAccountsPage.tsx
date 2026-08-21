import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CheckCircle2, Info, UserPlus } from 'lucide-react'
import { toast } from 'sonner'

import { StaffAccountForm } from '../components/admin/StaffAccountForm'
import { PageHeader } from '../components/common/PageHeader'
import { useI18n } from '../hooks/useI18n'
import { useStore } from '../store/store'
import { translate } from '../i18n/strings'
import { cn } from '../lib/utils'
import { ADMIN_HOME_ROUTE } from '../components/ProtectedRoute'
import type { StaffAccountDraft } from '../types/auth.types'

/**
 * Screen 8 — Staff Accounts (PRD F12, AC-10). An already-signed-in Admin creates
 * an additional Admin account here.
 *
 * The single most important thing about this screen is what it is *not*: there
 * is no public sign-up anywhere in this product. This page sits behind
 * ProtectedRoute, is linked only from the Admin dashboard, and posts to a
 * gateway route mounted behind `verifyJwt` — unlike `POST /api/auth/login`,
 * which is public because it is how a token is obtained in the first place. The
 * client-side guard is a convenience; api-gateway is the boundary that actually
 * rejects an unauthenticated attempt. If a future change makes this reachable
 * without a session, that is the regression the PRD names outright.
 *
 * Two smaller decisions:
 *
 * 1. A duplicate email renders as an inline `role="alert"` message rather than a
 *    toast, following AdminLoginPage's precedent for the same kind of outcome: a
 *    409 here is not an infrastructure fault, it is the expected answer to an
 *    address that is already taken, it belongs beside the form that caused it,
 *    and it must stay on screen while the Admin picks another address rather
 *    than fading out after a few seconds. Genuine failures (network, a broken
 *    gateway) still use a toast (.rule/error-handling-rules.md).
 * 2. On success the form is replaced by a confirmation rather than left standing
 *    empty. An emptied form beside a success message reads as "did that save, or
 *    did it clear?" — and on this screen guessing wrong means either a duplicate
 *    attempt or a colleague who never gets an account.
 */
export function AdminStaffAccountsPage() {
  const { t } = useI18n()

  const isSubmitting = useStore((state) => state.isCreatingStaffAccount)
  const createdAccount = useStore((state) => state.createdStaffAccount)
  const createStaffAccount = useStore((state) => state.createStaffAccount)
  const clearCreatedStaffAccount = useStore((state) => state.clearCreatedStaffAccount)

  const [hasDuplicateEmail, setHasDuplicateEmail] = useState(false)

  // Leaving the screen drops the confirmation, so coming back later opens on a
  // blank form rather than on a success message about an account created in
  // some earlier visit.
  useEffect(() => clearCreatedStaffAccount, [clearCreatedStaffAccount])

  const handleSubmit = async (draft: StaffAccountDraft) => {
    setHasDuplicateEmail(false)

    const outcome = await createStaffAccount(draft)
    // Read at completion time rather than closed over, so switching language
    // mid-request cannot show a message in the language that was active when
    // the request left.
    const { locale: activeLocale } = useStore.getState()

    if (outcome === 'success') {
      toast.success(translate(activeLocale, 'adminStaff.created.toast'))
      return
    }

    if (outcome === 'duplicateEmail') {
      setHasDuplicateEmail(true)
      return
    }

    toast.error(translate(activeLocale, 'adminStaff.error.toast'))
  }

  return (
    <main id="main-content" className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-10">
      <div className="flex flex-col gap-6 rounded-2xl border border-neutral-900/10 bg-white p-6 shadow-sm md:p-8">
        <span className="flex size-12 items-center justify-center rounded-xl bg-primary-light text-primary">
          <UserPlus className="size-6" aria-hidden="true" />
        </span>

        <PageHeader title={t('adminStaff.title')} subtitle={t('adminStaff.subtitle')} />

        {/* v1 has no roles or permission tiers, and the UI must not imply
            otherwise — an Admin who thinks they are adding a limited assistant
            is handing over the whole clinic without knowing it. */}
        <p
          className={cn(
            'flex items-start gap-2 rounded-xl border border-accent/40 bg-accent/10',
            'px-4 py-3 text-start text-sm text-neutral-900',
          )}
        >
          <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
          <span>
            <span className="font-semibold">{t('adminStaff.notice.title')}</span>{' '}
            {t('adminStaff.notice.body')}
          </span>
        </p>

        {/* One live region around the outcome, so a screen reader hears the
            confirmation or the rejection without re-navigating. */}
        <div aria-live="polite">
          {createdAccount ? (
            <div
              className={cn(
                'flex flex-col gap-4 rounded-xl border border-success/40 bg-primary-light',
                'px-4 py-4 text-start text-sm text-neutral-900',
              )}
            >
              <p className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                <span>
                  {/* Words carry the meaning; the colour and icon only reinforce it. */}
                  <span className="font-semibold">{t('adminStaff.created.title')}</span>{' '}
                  {t('adminStaff.created.body', {
                    name: createdAccount.name,
                    email: createdAccount.email,
                  })}
                </span>
              </p>

              <button
                type="button"
                onClick={clearCreatedStaffAccount}
                className={cn(
                  'inline-flex items-center justify-center gap-2 self-start rounded-xl',
                  'border border-primary/40 px-4 py-2.5 text-sm font-semibold text-primary',
                  'transition-colors hover:bg-white',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                )}
              >
                <UserPlus className="size-4 shrink-0" aria-hidden="true" />
                {t('adminStaff.created.another')}
              </button>
            </div>
          ) : (
            hasDuplicateEmail && (
              <div
                role="alert"
                className={cn(
                  'flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10',
                  'px-4 py-3 text-start text-sm text-danger',
                )}
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  <span className="font-semibold">{t('adminStaff.duplicate.title')}</span>{' '}
                  {t('adminStaff.duplicate.body')}
                </span>
              </div>
            )
          )}
        </div>

        {/* Unmounting the form on success is what clears it: dismissing the
            confirmation mounts a genuinely fresh one, so the password field can
            never be left holding the previous colleague's credential. A failed
            attempt leaves it mounted and untouched, because throwing away what
            was typed for a request that did not land is its own small cruelty. */}
        {!createdAccount && (
          <StaffAccountForm
            isSubmitting={isSubmitting}
            onSubmit={(draft) => void handleSubmit(draft)}
          />
        )}
      </div>

      <Link
        to={ADMIN_HOME_ROUTE}
        className={cn(
          'mt-6 inline-flex items-center gap-2 rounded-xl px-4 py-2.5',
          'text-sm font-semibold text-primary transition-colors hover:bg-primary-light',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        )}
      >
        {/* Points back toward the previous screen in both directions. */}
        <ArrowRight className="size-4 shrink-0 rotate-180 rtl:rotate-0" aria-hidden="true" />
        {t('adminStaff.back')}
      </Link>
    </main>
  )
}
