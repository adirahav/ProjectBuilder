import { motion } from 'framer-motion'
import { AlertTriangle, X } from 'lucide-react'

import { cn } from '../../lib/utils'
import { useI18n } from '../../hooks/useI18n'

interface HoldConflictBannerProps {
  onDismiss: () => void
}

/**
 * Shown when another Customer won the race for a slot (HTTP 409). This is an
 * expected outcome of normal concurrent use, not a crash, so it reads as an
 * explanation with a way forward rather than an error.
 *
 * `role="alert"` makes a screen reader announce it immediately — the Customer
 * has just pressed a slot and needs to know the list beneath them changed.
 * The warning icon and the copy both carry the meaning, so the tint is never
 * the only signal (accessibility-layer).
 */
export function HoldConflictBanner({ onDismiss }: HoldConflictBannerProps) {
  const { t } = useI18n()

  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18 }}
      className={cn(
        'flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4',
      )}
    >
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-sm font-semibold text-neutral-900">{t('timeSlot.conflict.title')}</p>
        <p className="text-sm text-neutral-900/70">{t('timeSlot.conflict.body')}</p>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('timeSlot.conflict.dismiss')}
        className={cn(
          'shrink-0 rounded-lg p-1.5 text-neutral-900/60 transition-colors',
          'hover:bg-neutral-900/5 hover:text-neutral-900',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        )}
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </motion.div>
  )
}
