import type { ReactNode } from 'react'
import { CalendarCheck, CheckCircle2, Clock, Mail, Phone, Scissors, User } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useI18n } from '../../hooks/useI18n'
import { cn } from '../../lib/utils'
import { formatDateLabel, formatTimeRange } from '../../utils/date.utils'
import { formatDuration, formatPrice } from '../../utils/format.utils'
import {
  appointmentStatusIconStyles,
  appointmentStatusIcons,
  appointmentStatusLabelKeys,
  appointmentStatusStyles,
} from '../../utils/appointmentStatus.utils'
import type { AppointmentReceipt } from '../../types/appointment.types'

interface ConfirmationSummaryProps {
  receipt: AppointmentReceipt
}

/**
 * Screen 4's receipt (PRD): everything the Customer just booked, in one card.
 *
 * Presentational only — it never fetches and never decides which booking to
 * show; the page hands it a resolved receipt or renders a different state
 * entirely.
 *
 * Two constraints shape the markup:
 *
 * - "Booked" is said in words and marked with an icon; the green tint only
 *   reinforces it, so the page still reads correctly in greyscale or to a
 *   screen reader (accessibility-layer).
 * - It is a description list, because that is what it is: labels paired with
 *   values. Assistive technology then announces "Phone: 050-123-4567" instead
 *   of two unrelated fragments.
 *
 * Rows whose fact is genuinely absent are omitted rather than rendered blank —
 * an empty row on a receipt reads as data lost, not data missing.
 */
export function ConfirmationSummary({ receipt }: ConfirmationSummaryProps) {
  const { locale, t } = useI18n()

  const StatusIcon = appointmentStatusIcons[receipt.status]
  const { service, timeSlot } = receipt

  return (
    <section
      aria-label={t('confirmation.summaryLabel')}
      className={cn(
        'flex flex-col gap-5 rounded-2xl border border-success/40 bg-white p-4',
        'shadow-sm md:gap-6 md:p-6',
      )}
    >
      {/* The headline outcome, stated rather than implied by colour. */}
      <p className="flex items-center gap-2 rounded-xl bg-primary-light px-3 py-2.5 text-sm font-semibold text-neutral-900">
        <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" />
        {t('confirmation.keepNotice')}
      </p>

      <SummaryGroup title={t('confirmation.appointmentLabel')}>
        {service && (
          <SummaryRow icon={Scissors} label={t('confirmation.serviceLabel')} value={service.name} />
        )}

        {timeSlot && (
          <>
            <SummaryRow
              icon={CalendarCheck}
              label={t('timeSlot.dateLabel')}
              value={formatDateLabel(timeSlot.date, locale)}
            />
            <SummaryRow icon={Clock} label={t('confirmation.timeLabel')}>
              {/* Wall-clock range stays LTR in both languages — a time is read
                  left-to-right even in Hebrew. */}
              <span dir="ltr" className="tabular-nums">
                {formatTimeRange(timeSlot.startTime, timeSlot.endTime)}
              </span>
            </SummaryRow>
          </>
        )}

        {service && (
          <>
            <SummaryRow
              label={t('service.durationLabel')}
              value={formatDuration(service.durationMinutes, locale)}
            />
            <SummaryRow
              label={t('service.priceLabel')}
              value={formatPrice(service.price, locale)}
            />
          </>
        )}

        <SummaryRow label={t('confirmation.statusLabel')}>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold',
              appointmentStatusStyles[receipt.status],
            )}
          >
            <StatusIcon
              className={cn('size-4 shrink-0', appointmentStatusIconStyles[receipt.status])}
              aria-hidden="true"
            />
            {t(appointmentStatusLabelKeys[receipt.status])}
          </span>
        </SummaryRow>

        <SummaryRow label={t('confirmation.referenceLabel')}>
          <span dir="ltr" className="font-mono text-xs break-all tabular-nums">
            {receipt.id}
          </span>
        </SummaryRow>
      </SummaryGroup>

      <SummaryGroup title={t('confirmation.contactLabel')}>
        <SummaryRow icon={User} label={t('confirmation.nameLabel')} value={receipt.customerName} />
        <SummaryRow icon={Phone} label={t('confirmation.phoneLabel')}>
          <span dir="ltr" className="tabular-nums">
            {receipt.customerPhone}
          </span>
        </SummaryRow>
        {/* Email is optional by design (PRD F4) — no row when there is none. */}
        {receipt.customerEmail && (
          <SummaryRow icon={Mail} label={t('confirmation.emailLabel')}>
            <span dir="ltr" className="break-all">
              {receipt.customerEmail}
            </span>
          </SummaryRow>
        )}
      </SummaryGroup>
    </section>
  )
}

function SummaryGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-neutral-900/70">{title}</h2>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</dl>
    </div>
  )
}

interface SummaryRowProps {
  label: string
  /** Plain text value; use `children` instead when the value needs its own markup. */
  value?: string
  icon?: LucideIcon
  children?: ReactNode
}

function SummaryRow({ label, value, icon: Icon, children }: SummaryRowProps) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="flex items-center gap-1.5 text-xs text-neutral-900/70">
        {Icon && <Icon className="size-3.5 shrink-0 text-primary" aria-hidden="true" />}
        {label}
      </dt>
      <dd className="text-base font-medium text-neutral-900">{children ?? value}</dd>
    </div>
  )
}
