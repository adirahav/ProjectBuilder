import { Link, useParams } from 'react-router-dom'
import { ArrowRight, CalendarCheck, Clock, UserRound } from 'lucide-react'

import { PageHeader } from '../components/common/PageHeader'
import { StateMessage } from '../components/common/StateMessage'
import { useI18n } from '../hooks/useI18n'
import { useStore } from '../store/store'
import { cn } from '../lib/utils'
import { formatDateLabel, formatTimeRange } from '../utils/date.utils'

/**
 * Screen 3 placeholder. The routing contract (`/book/:serviceId/details`) and
 * the hold handoff are established here so the Customer Details ticket only has
 * to fill in the form, not invent the navigation into it.
 *
 * The held slot is read from the store, which is a convenience only: the
 * server's hold is the real source of truth, so a hard refresh here costs the
 * Customer a re-pick and nothing more — hence the explicit "no hold yet" state
 * rather than a crash or a blank page.
 */
export function CustomerDetailsPage() {
  const { serviceId } = useParams<{ serviceId: string }>()
  const { locale, t } = useI18n()

  const heldSlot = useStore((state) => state.heldSlot)

  return (
    <main id="main-content" className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">
      <PageHeader title={t('details.title')} className="mb-6 md:mb-8" />

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

          <StateMessage
            icon={UserRound}
            title={t('details.comingSoon.title')}
            body={t('details.comingSoon.body')}
          />
        </div>
      ) : (
        <StateMessage
          icon={Clock}
          title={t('details.noHold.title')}
          body={t('details.noHold.body')}
        />
      )}

      <Link
        to={`/book/${serviceId ?? ''}`}
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
