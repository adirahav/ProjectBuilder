import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'

import { cn } from '../../lib/utils'
import { useI18n } from '../../hooks/useI18n'
import { formatTimeRange } from '../../utils/date.utils'
import {
  timeSlotStatusIconStyles,
  timeSlotStatusIcons,
  timeSlotStatusLabelKeys,
  timeSlotStatusStyles,
} from '../../utils/timeSlotStatus.utils'
import type { TimeSlot } from '../../types/timeSlot.types'

interface SlotButtonProps {
  slot: TimeSlot
  /** True while this slot's own hold request is in flight. */
  isHolding: boolean
  /** True while any slot's hold is in flight — blocks a double claim. */
  isAnyHolding: boolean
  onHold: (slot: TimeSlot) => void
}

/**
 * One selectable time. Presentational only: the page owns the hold request and
 * every state transition that follows it.
 *
 * Availability is carried by three independent signals — the status icon, the
 * "Available" text label, and the accessible name — so the tint from
 * timeSlotStatusStyles is never the thing that tells a Customer a slot is free
 * (accessibility-layer, .rule/style-rules.md).
 */
export function SlotButton({ slot, isHolding, isAnyHolding, onHold }: SlotButtonProps) {
  const { t } = useI18n()

  const StatusIcon = timeSlotStatusIcons[slot.status]
  const timeRange = formatTimeRange(slot.startTime, slot.endTime)

  // Only the in-flight slot is disabled by its own request; the others are
  // blocked too, so a fast double-tap cannot fire two holds at once.
  const isDisabled = isAnyHolding

  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.18 }}
      disabled={isDisabled}
      aria-busy={isHolding}
      aria-label={t('timeSlot.holdAria', { time: timeRange })}
      onClick={() => onHold(slot)}
      className={cn(
        'flex w-full flex-col items-center gap-1.5 rounded-xl border px-3 py-4',
        'text-center transition-colors',
        timeSlotStatusStyles[slot.status],
        'hover:border-primary hover:bg-primary-light',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        isDisabled && 'cursor-not-allowed opacity-60 hover:border-success/40 hover:bg-white',
      )}
    >
      <span className="flex items-center gap-2">
        {isHolding ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
        ) : (
          <StatusIcon
            className={cn('size-4 shrink-0', timeSlotStatusIconStyles[slot.status])}
            aria-hidden="true"
          />
        )}

        {/* Numerals stay LTR inside an RTL sentence, so 09:00 – 09:45 never
            renders reversed. */}
        <span dir="ltr" className="text-base font-semibold tabular-nums">
          {timeRange}
        </span>
      </span>

      <span className="text-xs font-medium text-neutral-900/70">
        {isHolding ? t('timeSlot.holding') : t(timeSlotStatusLabelKeys[slot.status])}
      </span>
    </motion.button>
  )
}
