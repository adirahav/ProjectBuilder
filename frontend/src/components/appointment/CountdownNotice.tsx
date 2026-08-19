import { motion } from 'framer-motion'
import { AlarmClock, Clock, TimerOff } from 'lucide-react'

import { useI18n } from '../../hooks/useI18n'
import { cn } from '../../lib/utils'
import { formatCountdown } from '../../utils/date.utils'

/** Below this, the notice escalates — a minute is not much time to type a name. */
const LAST_MINUTE_MS = 60_000

interface CountdownNoticeProps {
  /** Milliseconds left on the hold, or null when the server did not say. */
  remainingMs: number | null
  /** True once the hold is known to be gone, from the clock or from the server. */
  isExpired: boolean
}

/**
 * How long the Customer has left, in words and numerals — never a bare colour
 * change or a silent progress bar (accessibility-layer).
 *
 * The announcement is deliberately split from the display: the visible timer
 * ticks every second, and putting *that* in a live region would make a screen
 * reader interrupt itself once a second, drowning out the form it is warning
 * about. So the ticking numerals sit in an ordinary region a Customer can read
 * whenever they like, and a separate polite live region speaks only at the two
 * moments that actually change what to do — the last minute, and expiry.
 */
export function CountdownNotice({ remainingMs, isExpired }: CountdownNoticeProps) {
  const { t } = useI18n()

  // Nothing to count down to, and nothing has expired: staying silent beats
  // inventing a deadline the server never gave us.
  if (remainingMs === null && !isExpired) return null

  const hasExpired = isExpired || remainingMs === 0
  const isLastMinute = !hasExpired && remainingMs !== null && remainingMs < LAST_MINUTE_MS

  const Icon = hasExpired ? TimerOff : isLastMinute ? AlarmClock : Clock

  // Only these two states are worth interrupting a screen reader for.
  const announcement = hasExpired
    ? t('details.countdown.expired')
    : isLastMinute
      ? t('details.countdown.lastMinute')
      : ''

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border px-4 py-3',
        hasExpired
          ? 'border-danger/40 bg-danger/10'
          : isLastMinute
            ? 'border-warning/50 bg-warning/10'
            : 'border-primary/25 bg-primary-light',
      )}
    >
      <Icon
        className={cn(
          'size-5 shrink-0',
          hasExpired ? 'text-danger' : isLastMinute ? 'text-warning' : 'text-primary',
        )}
        aria-hidden="true"
      />

      <p className="text-sm text-neutral-900">
        {hasExpired ? (
          t('details.countdown.expired')
        ) : (
          <>
            <span className="sr-only">{t('details.countdown.label')}: </span>
            {/* `4:07` needs no directional wrapper: a colon between digits is a
                numeric separator to the bidi algorithm, so it takes the
                number's own direction even inside a Hebrew sentence. */}
            {t('details.countdown.body', { time: formatCountdown(remainingMs ?? 0) })}
          </>
        )}
      </p>

      {/* Announced only when it changes, which is at most twice per hold. */}
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </motion.div>
  )
}
