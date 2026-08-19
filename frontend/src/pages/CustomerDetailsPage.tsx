import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, CalendarCheck, Clock, TimerOff } from 'lucide-react'
import { toast } from 'sonner'

import { PageHeader } from '../components/common/PageHeader'
import { StateMessage } from '../components/common/StateMessage'
import { CountdownNotice } from '../components/appointment/CountdownNotice'
import { CustomerDetailsForm } from '../components/appointment/CustomerDetailsForm'
import { useCountdown } from '../hooks/useCountdown'
import { useI18n } from '../hooks/useI18n'
import { useStore } from '../store/store'
import { translate } from '../i18n/strings'
import { cn } from '../lib/utils'
import { formatDateLabel, formatTimeRange } from '../utils/date.utils'
import type { CustomerDetails } from '../types/appointment.types'

/**
 * Screen 3 — the Customer Details form (PRD F4). Public and unauthenticated by
 * design: a Customer has no account and never logs in.
 *
 * Three things make this screen more than a form:
 *
 * 1. The held slot is read from the store, which is a convenience only — the
 *    server's hold is the real source of truth, so a hard refresh here costs
 *    the Customer a re-pick and nothing more.
 * 2. The hold is short-lived, so the time left is shown rather than letting the
 *    form quietly stop working. The countdown is a courtesy: the server's 409
 *    on submit is the authority on whether the hold still stands, and the
 *    client timer is never allowed to be the thing that decides.
 * 3. A lapsed hold is an expected outcome, not a failure — it gets its own
 *    explanation and a way back to the picker, never a generic error
 *    (.rule/error-handling-rules.md).
 */
export function CustomerDetailsPage() {
  const { serviceId } = useParams<{ serviceId: string }>()
  const { locale, t } = useI18n()
  const navigate = useNavigate()

  const heldSlot = useStore((state) => state.heldSlot)
  const isCreatingAppointment = useStore((state) => state.isCreatingAppointment)
  const hasHoldExpired = useStore((state) => state.hasHoldExpired)

  const createAppointment = useStore((state) => state.createAppointment)
  const expireHold = useStore((state) => state.expireHold)
  const resetAppointmentFlow = useStore((state) => state.resetAppointmentFlow)

  const remainingMs = useCountdown(heldSlot?.holdExpiresAt)

  // Arriving here starts a fresh booking attempt: a lapsed-hold notice or an
  // Appointment left over from a previous run must not greet the Customer.
  useEffect(() => {
    resetAppointmentFlow()
  }, [resetAppointmentFlow])

  // The countdown running out is only a client-side signal, but it is a correct
  // one often enough to be worth acting on rather than letting the Customer
  // finish typing into a form that cannot succeed.
  useEffect(() => {
    if (remainingMs === 0) expireHold()
  }, [remainingMs, expireHold])

  const pickerPath = `/book/${serviceId ?? ''}`

  const handleSubmit = async (details: CustomerDetails) => {
    const outcome = await createAppointment(details)
    // Read at failure time rather than closed over, so switching language
    // mid-request cannot show a message in the language that was active when
    // the request left.
    const activeLocale = useStore.getState().locale

    if (outcome === 'created') {
      toast.success(translate(activeLocale, 'details.success.toast'))
      navigate(`/book/${serviceId ?? ''}/confirmation`)
      return
    }

    toast.error(
      translate(
        activeLocale,
        outcome === 'conflict' ? 'details.conflict.toast' : 'details.error.toast',
      ),
    )
  }

  return (
    <main id="main-content" className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <PageHeader
        title={t('details.title')}
        subtitle={heldSlot ? t('details.subtitle') : undefined}
        className="mb-6 md:mb-8"
      />

      {heldSlot ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 rounded-2xl border border-success/40 bg-primary-light p-4 md:p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
              <CalendarCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
              {t('details.heldLabel')}
            </p>

            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-neutral-900">
              <span>{formatDateLabel(heldSlot.date, locale)}</span>
              <span className="flex items-center gap-1.5 font-semibold">
                <Clock className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span dir="ltr" className="tabular-nums">
                  {formatTimeRange(heldSlot.startTime, heldSlot.endTime)}
                </span>
              </span>
            </p>
          </div>

          <CountdownNotice remainingMs={remainingMs} isExpired={hasHoldExpired} />

          {hasHoldExpired ? (
            <StateMessage
              icon={TimerOff}
              tone="danger"
              title={t('details.expired.title')}
              body={t('details.expired.body')}
              actionLabel={t('details.expired.action')}
              onAction={() => navigate(pickerPath)}
            />
          ) : (
            <CustomerDetailsForm
              isSubmitting={isCreatingAppointment}
              isDisabled={false}
              onSubmit={(details) => void handleSubmit(details)}
            />
          )}
        </div>
      ) : (
        <StateMessage
          icon={Clock}
          title={t('details.noHold.title')}
          body={t('details.noHold.body')}
        />
      )}

      <Link
        to={pickerPath}
        className={cn(
          'mt-6 inline-flex items-center gap-2 rounded-xl px-4 py-2.5',
          'text-sm font-semibold text-primary transition-colors hover:bg-primary-light',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        )}
      >
        {/* Points back toward the previous screen in both directions. */}
        <ArrowRight className="size-4 shrink-0 rotate-180 rtl:rotate-0" aria-hidden="true" />
        {t('details.back')}
      </Link>
    </main>
  )
}
