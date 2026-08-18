import { Link, useParams } from 'react-router-dom'
import { ArrowRight, CalendarClock } from 'lucide-react'

import { PageHeader } from '../components/common/PageHeader'
import { StateMessage } from '../components/common/StateMessage'
import { useI18n } from '../hooks/useI18n'
import { useStore } from '../store/store'
import { cn } from '../lib/utils'

/**
 * Screen 2 placeholder. The routing contract (`/book/:serviceId`) is
 * established here so the Time Slot Picker ticket only has to fill in this
 * page's body, not invent the navigation into it.
 */
export function BookPage() {
  const { serviceId } = useParams<{ serviceId: string }>()
  const { t } = useI18n()

  // The Service may already be in the store from Screen 1; if the customer deep
  // linked straight here it will not be, and the generic title is used instead.
  const service = useStore((state) => state.services.find((item) => item.id === serviceId))

  return (
    <main id="main-content" className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">
      <PageHeader
        title={service ? t('book.title', { name: service.name }) : t('book.titleFallback')}
        className="mb-6 md:mb-8"
      />

      <StateMessage
        icon={CalendarClock}
        title={t('book.comingSoon.title')}
        body={t('book.comingSoon.body')}
      />

      <Link
        to="/"
        className={cn(
          'mt-6 inline-flex items-center gap-2 rounded-xl px-4 py-2.5',
          'text-sm font-semibold text-primary transition-colors hover:bg-primary-light',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        )}
      >
        {/* Points back toward the previous screen in both directions. */}
        <ArrowRight className="size-4 shrink-0 rotate-180 rtl:rotate-0" aria-hidden="true" />
        {t('book.back')}
      </Link>
    </main>
  )
}
