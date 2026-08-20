import { Check, X } from 'lucide-react'

import { useI18n } from '../../hooks/useI18n'
import { cn } from '../../lib/utils'
import { formatDateLabel, formatTimeRange } from '../../utils/date.utils'
import {
  appointmentStatusIconStyles,
  appointmentStatusIcons,
  appointmentStatusLabelKeys,
  appointmentStatusStyles,
  canCancelAppointment,
  canConfirmAppointment,
} from '../../utils/appointmentStatus.utils'
import type { AdminAppointment } from '../../types/appointment.types'

interface AdminAppointmentTableProps {
  appointments: AdminAppointment[]
  /** True while any confirm/cancel is in flight — every row action is blocked meanwhile. */
  isBusy: boolean
  onConfirm: (appointment: AdminAppointment) => void
  onCancel: (appointment: AdminAppointment) => void
}

/**
 * The Admin's view of every booking in the clinic (PRD F9-F11, Screen 7).
 *
 * A real `<table>` with real headers, not a grid of divs: the Admin scans down
 * the time column to read the day's schedule, and a screen reader can only
 * announce "Customer, Dana Levi" if the header cell actually exists.
 *
 * The status is a word plus an icon; the tint is a third, redundant signal. A
 * cancelled booking must be distinguishable in greyscale and by someone who
 * cannot tell the two colours apart (accessibility-layer) — which matters more
 * here than anywhere else in the app, since "cancelled" and "confirmed" are
 * opposite instructions to a person about to groom a dog.
 *
 * Each action is absent, not disabled, on a row it could never apply to: there
 * is no confirming an already-cancelled booking, and a permanently dead control
 * on every such row is noise in the tab order. Which statuses admit which action
 * is decided in appointmentStatus.utils, not re-derived here.
 *
 * The phone number is a `tel:` link, because the one thing an Admin does with a
 * customer's number on this screen is call it — usually right before cancelling.
 */
export function AdminAppointmentTable({
  appointments,
  isBusy,
  onConfirm,
  onCancel,
}: AdminAppointmentTableProps) {
  const { t, locale } = useI18n()

  return (
    <div className="overflow-x-auto rounded-2xl border border-neutral-900/10 bg-white">
      <table className="w-full min-w-[48rem] border-collapse text-start text-sm">
        <caption className="sr-only">{t('adminAppointments.tableLabel')}</caption>

        <thead>
          <tr className="border-b border-neutral-900/10 text-xs uppercase tracking-wide text-neutral-900/60">
            <th scope="col" className="px-4 py-3 text-start font-semibold">
              {t('adminAppointments.column.time')}
            </th>
            <th scope="col" className="px-4 py-3 text-start font-semibold">
              {t('adminAppointments.column.service')}
            </th>
            <th scope="col" className="px-4 py-3 text-start font-semibold">
              {t('adminAppointments.column.customer')}
            </th>
            <th scope="col" className="px-4 py-3 text-start font-semibold">
              {t('adminAppointments.column.status')}
            </th>
            <th scope="col" className="px-4 py-3 text-end font-semibold">
              {t('adminAppointments.column.actions')}
            </th>
          </tr>
        </thead>

        <tbody>
          {appointments.map((appointment) => {
            const StatusIcon = appointmentStatusIcons[appointment.status]
            const { timeSlot, service } = appointment

            return (
              <tr
                key={appointment.id}
                className={cn(
                  'border-b border-neutral-900/5 last:border-b-0',
                  // Muted, never the only cue: the badge below says it in words.
                  appointment.status === 'cancelled' && 'bg-neutral-50',
                )}
              >
                <th scope="row" className="px-4 py-4 text-start font-semibold text-neutral-900">
                  {timeSlot ? (
                    <span className="flex flex-col gap-0.5">
                      <span>{formatDateLabel(timeSlot.date, locale)}</span>
                      <span className="text-sm font-medium text-neutral-900/70">
                        {formatTimeRange(timeSlot.startTime, timeSlot.endTime)}
                      </span>
                    </span>
                  ) : (
                    // Saying the fact is gone beats inventing a time for it.
                    <span className="font-medium text-neutral-900/60">
                      {t('adminAppointments.unknownTime')}
                    </span>
                  )}
                </th>

                <td className="px-4 py-4 text-neutral-900/80">
                  {service ? (
                    service.name
                  ) : (
                    <span className="text-neutral-900/60">
                      {t('adminAppointments.unknownService')}
                    </span>
                  )}
                </td>

                <td className="px-4 py-4">
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium text-neutral-900">
                      {appointment.customerName}
                    </span>
                    <a
                      href={`tel:${appointment.customerPhone}`}
                      aria-label={t('adminAppointments.phoneAria', {
                        name: appointment.customerName,
                        phone: appointment.customerPhone,
                      })}
                      className={cn(
                        'text-sm text-primary underline-offset-2 hover:underline',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                      )}
                      // The number is a Western-digit sequence: without this it
                      // reorders visually inside a Hebrew (RTL) sentence.
                      dir="ltr"
                    >
                      {appointment.customerPhone}
                    </a>
                  </span>
                </td>

                <td className="px-4 py-4">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold',
                      appointmentStatusStyles[appointment.status],
                    )}
                  >
                    <StatusIcon
                      className={cn(
                        'size-3.5 shrink-0',
                        appointmentStatusIconStyles[appointment.status],
                      )}
                      aria-hidden="true"
                    />
                    {t(appointmentStatusLabelKeys[appointment.status])}
                  </span>
                </td>

                <td className="px-4 py-4">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {canConfirmAppointment(appointment.status) && (
                      <button
                        type="button"
                        onClick={() => onConfirm(appointment)}
                        disabled={isBusy}
                        // The visible label repeats on every row, so the
                        // accessible name names the booking as well.
                        aria-label={t('adminAppointments.confirmAria', {
                          name: appointment.customerName,
                        })}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2',
                          'text-xs font-semibold text-white transition-colors hover:bg-primary/90',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                          isBusy && 'cursor-not-allowed opacity-60 hover:bg-primary',
                        )}
                      >
                        <Check className="size-3.5 shrink-0" aria-hidden="true" />
                        {t('adminAppointments.confirm')}
                      </button>
                    )}

                    {canCancelAppointment(appointment.status) && (
                      <button
                        type="button"
                        onClick={() => onCancel(appointment)}
                        disabled={isBusy}
                        aria-label={t('adminAppointments.cancelAria', {
                          name: appointment.customerName,
                        })}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-xl border border-danger/40 px-3 py-2',
                          'text-xs font-semibold text-danger transition-colors hover:bg-danger/10',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2',
                          isBusy && 'cursor-not-allowed opacity-60',
                        )}
                      >
                        <X className="size-3.5 shrink-0" aria-hidden="true" />
                        {t('adminAppointments.cancel')}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
