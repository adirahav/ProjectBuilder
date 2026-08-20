import { CheckCircle2, EyeOff, Pencil } from 'lucide-react'

import { useI18n } from '../../hooks/useI18n'
import { cn } from '../../lib/utils'
import { formatDuration, formatPrice } from '../../utils/format.utils'
import type { Service } from '../../types/service.types'

interface AdminServiceTableProps {
  services: Service[]
  /** True while any write is in flight — every row action is blocked meanwhile. */
  isBusy: boolean
  onEdit: (service: Service) => void
  onDeactivate: (service: Service) => void
}

/**
 * The Admin's view of every Service on record (PRD F6-F8), deactivated ones
 * included — that is the whole difference from the customer-facing list.
 *
 * A real `<table>` with real headers, not a grid of divs: the Admin is
 * comparing durations and prices down a column, and a screen reader can only
 * announce "Price, 220" if the header cell actually exists.
 *
 * The status is a word plus an icon. The tint is a third, redundant signal —
 * "not offered" must be readable in greyscale and by someone who cannot
 * distinguish the two colours (accessibility-layer).
 *
 * "Stop offering" is absent, not disabled, on a row that is already not
 * offered: a control that could never do anything is noise in the tab order,
 * and the edit form is where such a row is brought back.
 */
export function AdminServiceTable({
  services,
  isBusy,
  onEdit,
  onDeactivate,
}: AdminServiceTableProps) {
  const { t, locale } = useI18n()

  return (
    <div className="overflow-x-auto rounded-2xl border border-neutral-900/10 bg-white">
      <table className="w-full min-w-[36rem] border-collapse text-start text-sm">
        <caption className="sr-only">{t('adminServices.tableLabel')}</caption>

        <thead>
          <tr className="border-b border-neutral-900/10 text-xs uppercase tracking-wide text-neutral-900/60">
            <th scope="col" className="px-4 py-3 text-start font-semibold">
              {t('adminServices.column.name')}
            </th>
            <th scope="col" className="px-4 py-3 text-start font-semibold">
              {t('adminServices.column.duration')}
            </th>
            <th scope="col" className="px-4 py-3 text-start font-semibold">
              {t('adminServices.column.price')}
            </th>
            <th scope="col" className="px-4 py-3 text-start font-semibold">
              {t('adminServices.column.status')}
            </th>
            <th scope="col" className="px-4 py-3 text-end font-semibold">
              {t('adminServices.column.actions')}
            </th>
          </tr>
        </thead>

        <tbody>
          {services.map((service) => (
            <tr
              key={service.id}
              className={cn(
                'border-b border-neutral-900/5 last:border-b-0',
                // Muted, never the only cue: the badge below says it in words.
                !service.isActive && 'bg-neutral-50',
              )}
            >
              <th scope="row" className="px-4 py-4 text-start font-semibold text-neutral-900">
                {service.name}
              </th>
              <td className="px-4 py-4 text-neutral-900/80">
                {formatDuration(service.durationMinutes, locale)}
              </td>
              <td className="px-4 py-4 text-neutral-900/80">
                {formatPrice(service.price, locale)}
              </td>
              <td className="px-4 py-4">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
                    service.isActive
                      ? 'bg-primary-light text-primary'
                      : 'bg-neutral-900/10 text-neutral-900/70',
                  )}
                >
                  {service.isActive ? (
                    <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <EyeOff className="size-3.5 shrink-0" aria-hidden="true" />
                  )}
                  {service.isActive
                    ? t('adminServices.status.active')
                    : t('adminServices.status.inactive')}
                </span>
              </td>
              <td className="px-4 py-4">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(service)}
                    disabled={isBusy}
                    // The visible label repeats on every row, so the accessible
                    // name names the treatment as well.
                    aria-label={t('adminServices.editAria', { name: service.name })}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-xl border border-neutral-900/15 px-3 py-2',
                      'text-xs font-semibold text-neutral-900 transition-colors hover:bg-primary-light',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                      isBusy && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    <Pencil className="size-3.5 shrink-0" aria-hidden="true" />
                    {t('adminServices.edit')}
                  </button>

                  {service.isActive && (
                    <button
                      type="button"
                      onClick={() => onDeactivate(service)}
                      disabled={isBusy}
                      aria-label={t('adminServices.deactivateAria', { name: service.name })}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-xl border border-danger/40 px-3 py-2',
                        'text-xs font-semibold text-danger transition-colors hover:bg-danger/10',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2',
                        isBusy && 'cursor-not-allowed opacity-60',
                      )}
                    >
                      <EyeOff className="size-3.5 shrink-0" aria-hidden="true" />
                      {t('adminServices.deactivate')}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
