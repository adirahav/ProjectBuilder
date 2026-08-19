import { Link } from 'react-router-dom'
import { CalendarCheck, CalendarX2, Clock, PartyPopper } from 'lucide-react'

import { PageHeader } from '../components/common/PageHeader'
import { StateMessage } from '../components/common/StateMessage'
import { useI18n } from '../hooks/useI18n'
import { useStore } from '../store/store'
import { cn } from '../lib/utils'
import { formatDateLabel, formatTimeRange } from '../utils/date.utils'
import {
  appointmentStatusIconStyles,
  appointmentStatusIcons,
  appointmentStatusLabelKeys,
  appointmentStatusStyles,
} from '../utils/appointmentStatus.utils'

/**
 * Screen 4 placeholder. The routing contract (`/book/:serviceId/confirmation`)
 * and the handoff of the created Appointment are established here so the
 * Booking Confirmation ticket only has to fill in the summary, not invent the
 * navigation into it.
 *
 * It already renders enough to close the loop honestly — the booking reference
 * and its `pending` status — because telling someone "booked!" and showing them
 * nothing to prove it is worse than showing them a little.
 */
export function BookingConfirmationPage() {
  const { locale, t } = useI18n()

  const appointment = useStore((state) => state.appointment)
  // The slot the Appointment was made from, kept in the store through the
  // booking; it is what makes the date and time renderable without a re-fetch.
  const heldSlot = useStore((state) => state.heldSlot)

  if (!appointment) {
    return (
      <main id="main-content" className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
        <PageHeader title={t('confirmation.title')} className="mb-6 md:mb-8" />

        <StateMessage
          icon={CalendarX2}
          title={t('confirmation.noAppointment.title')}
          body={t('confirmation.noAppointment.body')}
        />

        <BackToServicesLink label={t('confirmation.back')} />
      </main>
    )
  }

  const StatusIcon = appointmentStatusIcons[appointment.status]

  return (
    <main id="main-content" className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <PageHeader
        title={t('confirmation.title')}
        subtitle={t('confirmation.subtitle')}
        className="mb-6 md:mb-8"
      />

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-success/40 bg-primary-light p-4 md:p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
            <PartyPopper className="size-4 shrink-0 text-success" aria-hidden="true" />
            {appointment.customerName}
          </p>

          {heldSlot && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-neutral-900">
              <CalendarCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />
              <span>{formatDateLabel(heldSlot.date, locale)}</span>
              <span className="flex items-center gap-1.5 font-semibold">
                <Clock className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span dir="ltr" className="tabular-nums">
                  {formatTimeRange(heldSlot.startTime, heldSlot.endTime)}
                </span>
              </span>
            </p>
          )}

          <p className="flex flex-wrap items-center gap-2 text-sm text-neutral-900">
            <span className="text-neutral-900/70">{t('confirmation.statusLabel')}:</span>
            {/* Status is a word and an icon first; the tint only reinforces it
                (.rule/style-rules.md, accessibility-layer). */}
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-semibold',
                appointmentStatusStyles[appointment.status],
              )}
            >
              <StatusIcon
                className={cn('size-4 shrink-0', appointmentStatusIconStyles[appointment.status])}
                aria-hidden="true"
              />
              {t(appointmentStatusLabelKeys[appointment.status])}
            </span>
          </p>

          <p className="flex flex-wrap items-center gap-2 text-sm text-neutral-900">
            <span className="text-neutral-900/70">{t('confirmation.referenceLabel')}:</span>
            <span dir="ltr" className="font-mono text-xs tabular-nums">
              {appointment.id}
            </span>
          </p>
        </div>

        <StateMessage
          icon={CalendarCheck}
          title={t('confirmation.comingSoon.title')}
          body={t('confirmation.comingSoon.body')}
        />
      </div>

      <BackToServicesLink label={t('confirmation.back')} />
    </main>
  )
}

function BackToServicesLink({ label }: { label: string }) {
  return (
    <Link
      to="/"
      className={cn(
        'mt-6 inline-flex items-center gap-2 rounded-xl px-4 py-2.5',
        'text-sm font-semibold text-primary transition-colors hover:bg-primary-light',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
      )}
    >
      {label}
    </Link>
  )
}
