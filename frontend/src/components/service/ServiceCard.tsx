import { ArrowRight, Clock, Wallet } from 'lucide-react'

import { cn } from '../../lib/utils'
import { useI18n } from '../../hooks/useI18n'
import { formatDuration, formatPrice } from '../../utils/format.utils'
import type { Service } from '../../types/service.types'

interface ServiceCardProps {
  service: Service
  onBook: (serviceId: string) => void
}

/**
 * Presentational card for one Service: name, duration, price and the Book
 * action. Purely dumb — the page owns fetching and navigation.
 */
export function ServiceCard({ service, onBook }: ServiceCardProps) {
  const { locale, t } = useI18n()

  return (
    <article className="flex h-full flex-col gap-5 rounded-2xl border border-neutral-900/10 bg-white p-5 shadow-sm transition-shadow hover:shadow-md md:p-6">
      <h3 className="text-lg font-semibold text-neutral-900 md:text-xl">{service.name}</h3>

      <dl className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
        <div className="flex items-center gap-2">
          <Clock className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <dt className="sr-only">{t('service.durationLabel')}</dt>
          <dd className="text-neutral-900/70">{formatDuration(service.durationMinutes, locale)}</dd>
        </div>

        <div className="flex items-center gap-2">
          <Wallet className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <dt className="sr-only">{t('service.priceLabel')}</dt>
          <dd className="text-base font-semibold text-neutral-900">
            {formatPrice(service.price, locale)}
          </dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={() => onBook(service.id)}
        aria-label={t('service.bookAria', { name: service.name })}
        className={cn(
          'mt-auto inline-flex items-center justify-center gap-2 rounded-xl bg-primary',
          'px-5 py-3 text-base font-semibold text-white transition-colors',
          'hover:bg-primary/90 active:bg-primary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        )}
      >
        {t('service.book')}
        {/* Forward arrow: rotated in RTL so it always points the way the reader moves. */}
        <ArrowRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
      </button>
    </article>
  )
}
