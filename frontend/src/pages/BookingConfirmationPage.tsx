import { useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, CalendarX2, PawPrint } from 'lucide-react'
import { toast } from 'sonner'

import { PageHeader } from '../components/common/PageHeader'
import { StateMessage } from '../components/common/StateMessage'
import { ConfirmationSummary } from '../components/appointment/ConfirmationSummary'
import { useBookingReceipt } from '../hooks/useBookingReceipt'
import { useI18n } from '../hooks/useI18n'
import { useStore } from '../store/store'
import { translate } from '../i18n/strings'
import { cn } from '../lib/utils'

/**
 * Screen 4 — the Booking Confirmation (PRD). Public and unauthenticated, like
 * the rest of the booking flow: a Customer has no account, so this page is the
 * only receipt they get.
 *
 * That last point drives the design. The receipt is resolved by
 * `useBookingReceipt` from the just-created booking when it is still in memory,
 * and re-fetched by the id in the URL when it is not — so a reload or a
 * bookmark does not destroy the only proof the Customer has.
 *
 * Nothing here is ever a blank page: a missing booking gets an explanation and
 * a route back to the Service List, and a failed lookup gets a retry, per
 * .rule/error-handling-rules.md.
 */
export function BookingConfirmationPage() {
  const { appointmentId } = useParams<{ appointmentId: string }>()
  const { t } = useI18n()

  const { receipt, state, retry } = useBookingReceipt(appointmentId)

  // One toast per failed lookup, not one per render. A "not found" is a normal
  // answer and gets no toast — the message on the page says it plainly, and a
  // toast would only repeat it (.rule/error-handling-rules.md).
  const hasToastedRef = useRef(false)

  useEffect(() => {
    if (state !== 'error') {
      hasToastedRef.current = false
      return
    }

    if (hasToastedRef.current) return
    hasToastedRef.current = true
    toast.error(translate(useStore.getState().locale, 'confirmation.error.toast'))
  }, [state])

  const isReady = state === 'ready' && receipt !== null

  return (
    <main id="main-content" className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <PageHeader
        title={t('confirmation.title')}
        subtitle={isReady ? t('confirmation.subtitle') : undefined}
        className="mb-6 md:mb-8"
      />

      {/* A single live region across every outcome, so a screen reader hears the
          receipt arrive — or hears why it did not — without re-navigating. */}
      <section aria-live="polite" aria-busy={state === 'loading'}>
        {state === 'loading' ? (
          <>
            <span className="sr-only">{t('confirmation.loading')}</span>
            <ConfirmationSkeleton />
          </>
        ) : state === 'error' ? (
          <StateMessage
            icon={AlertTriangle}
            tone="danger"
            title={t('confirmation.error.title')}
            body={t('confirmation.error.body')}
            actionLabel={t('common.retry')}
            onAction={retry}
          />
        ) : isReady ? (
          <ConfirmationSummary receipt={receipt} />
        ) : (
          <StateMessage
            icon={CalendarX2}
            title={t('confirmation.notFound.title')}
            body={t('confirmation.notFound.body')}
          />
        )}
      </section>

      <Link
        to="/"
        className={cn(
          'mt-6 inline-flex items-center gap-2 rounded-xl px-4 py-2.5',
          'text-sm font-semibold text-primary transition-colors hover:bg-primary-light',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        )}
      >
        <PawPrint className="size-4 shrink-0" aria-hidden="true" />
        {isReady ? t('confirmation.bookAnother') : t('confirmation.back')}
      </Link>
    </main>
  )
}

/**
 * Placeholder of roughly the receipt's shape, so the page does not jump when
 * the real thing arrives. Purely decorative: the loading state is announced in
 * text by the region above.
 */
function ConfirmationSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col gap-4 rounded-2xl border border-neutral-900/10 bg-white p-4 md:p-6"
    >
      <div className="h-10 w-full animate-pulse rounded-xl bg-primary-light" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex flex-col gap-2">
            <div className="h-3 w-20 animate-pulse rounded bg-neutral-900/10" />
            <div className="h-5 w-32 animate-pulse rounded bg-neutral-900/10" />
          </div>
        ))}
      </div>
    </div>
  )
}
