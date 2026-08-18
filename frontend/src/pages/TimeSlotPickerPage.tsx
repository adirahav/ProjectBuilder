import { useCallback, useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { AlertTriangle, ArrowRight, CalendarOff, CalendarX2 } from 'lucide-react'
import { toast } from 'sonner'

import { PageHeader } from '../components/common/PageHeader'
import { StateMessage } from '../components/common/StateMessage'
import { DatePicker } from '../components/timeSlot/DatePicker'
import { HoldConflictBanner } from '../components/timeSlot/HoldConflictBanner'
import { SlotGrid } from '../components/timeSlot/SlotGrid'
import { SlotGridSkeleton } from '../components/timeSlot/SlotGridSkeleton'
import { useI18n } from '../hooks/useI18n'
import { useStore } from '../store/store'
import { translate } from '../i18n/strings'
import { cn } from '../lib/utils'
import { formatDateLabel, isPastDateKey } from '../utils/date.utils'
import type { TimeSlot } from '../types/timeSlot.types'

/**
 * Screen 2 — the Time Slot Picker (PRD F2/F3). Public and unauthenticated by
 * design: no logged-in check belongs on this page.
 *
 * Selecting a time is not a local UI selection, it is a request: the slot is
 * held server-side the moment the Customer picks it, and only the response is
 * trusted. Losing that race is normal, so a 409 is handled as its own path —
 * banner plus a refreshed list — never as a generic failure
 * (.rule/error-handling-rules.md).
 */
export function TimeSlotPickerPage() {
  const { serviceId } = useParams<{ serviceId: string }>()
  const { locale, t } = useI18n()
  const navigate = useNavigate()

  // The Service may already be in the store from Screen 1; on a deep link it
  // will not be, and the generic title is used instead.
  const service = useStore((state) => state.services.find((item) => item.id === serviceId))

  const selectedDate = useStore((state) => state.selectedDate)
  const timeSlots = useStore((state) => state.timeSlots)
  const isLoading = useStore((state) => state.isLoadingTimeSlots)
  const hasError = useStore((state) => state.hasTimeSlotsError)
  const holdingSlotId = useStore((state) => state.holdingSlotId)
  const hasHoldConflict = useStore((state) => state.hasHoldConflict)

  const setSelectedDate = useStore((state) => state.setSelectedDate)
  const loadTimeSlots = useStore((state) => state.loadTimeSlots)
  const holdTimeSlot = useStore((state) => state.holdTimeSlot)
  const dismissHoldConflict = useStore((state) => state.dismissHoldConflict)

  // A day that has already passed can only ever come back empty, so it is
  // answered locally instead of spending a request to be told so.
  const isPastDate = isPastDateKey(selectedDate)

  const handleLoad = useCallback(async () => {
    if (!serviceId || isPastDate) return

    try {
      await loadTimeSlots(serviceId, selectedDate)
    } catch {
      // The locale is read at failure time rather than closed over, so this
      // callback stays stable and switching language never refires the fetch.
      toast.error(translate(useStore.getState().locale, 'timeSlot.error.toast'))
    }
  }, [serviceId, selectedDate, isPastDate, loadTimeSlots])

  useEffect(() => {
    void handleLoad()
  }, [handleLoad])

  const handleHold = async (slot: TimeSlot) => {
    if (!serviceId) return

    // The slice owns every state change here — including re-syncing the list
    // after a conflict — so this page only maps the outcome to feedback.
    const outcome = await holdTimeSlot(serviceId, slot)
    const activeLocale = useStore.getState().locale

    if (outcome === 'held') {
      toast.success(translate(activeLocale, 'timeSlot.hold.successToast'))
      navigate(`/book/${serviceId}/details`)
      return
    }

    toast.error(
      translate(
        activeLocale,
        outcome === 'conflict' ? 'timeSlot.conflict.toast' : 'timeSlot.hold.errorToast',
      ),
    )
  }

  const dateLabel = formatDateLabel(selectedDate, locale)

  return (
    <main id="main-content" className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">
      <PageHeader
        title={service ? t('book.title', { name: service.name }) : t('book.titleFallback')}
        subtitle={t('book.subtitle')}
        className="mb-6 md:mb-8"
      />

      <div className="flex flex-col gap-6">
        <DatePicker value={selectedDate} onChange={setSelectedDate} />

        {/* The banner sits above the grid so the explanation is read before the
            refreshed times it refers to. */}
        <AnimatePresence>
          {hasHoldConflict && <HoldConflictBanner onDismiss={dismissHoldConflict} />}
        </AnimatePresence>

        {/* One live region wraps every outcome, so a screen reader hears the
            times arriving, the empty message, or the failure without
            re-navigating. */}
        <section aria-live="polite" aria-busy={isLoading}>
          {isPastDate ? (
            <StateMessage
              icon={CalendarX2}
              title={t('timeSlot.pastDate.title')}
              body={t('timeSlot.pastDate.body')}
            />
          ) : isLoading ? (
            <>
              <span className="sr-only">{t('timeSlot.loading')}</span>
              <SlotGridSkeleton />
            </>
          ) : hasError ? (
            <StateMessage
              icon={AlertTriangle}
              tone="danger"
              title={t('timeSlot.error.title')}
              body={t('timeSlot.error.body')}
              actionLabel={t('common.retry')}
              onAction={() => void handleLoad()}
            />
          ) : timeSlots.length === 0 ? (
            <StateMessage
              icon={CalendarOff}
              title={t('timeSlot.empty.title')}
              body={t('timeSlot.empty.body', { date: dateLabel })}
            />
          ) : (
            <SlotGrid
              slots={timeSlots}
              label={t('timeSlot.regionLabel', { date: dateLabel })}
              holdingSlotId={holdingSlotId}
              onHold={(slot) => void handleHold(slot)}
            />
          )}
        </section>
      </div>

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
