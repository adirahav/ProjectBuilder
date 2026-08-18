import type { LucideIcon } from 'lucide-react'

import { cn } from '../../lib/utils'

interface StateMessageProps {
  icon: LucideIcon
  title: string
  body: string
  /** Optional recovery action, e.g. "Try again" on the error state. */
  actionLabel?: string
  onAction?: () => void
  tone?: 'neutral' | 'danger'
}

/**
 * Shared empty/error presentation. Tone only changes the icon colour — the
 * title and body always carry the meaning in text, so nothing depends on
 * colour alone.
 */
export function StateMessage({
  icon: Icon,
  title,
  body,
  actionLabel,
  onAction,
  tone = 'neutral',
}: StateMessageProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-2xl border border-dashed border-neutral-900/15',
        'bg-white px-6 py-12 text-center',
      )}
    >
      <span
        className={cn(
          'flex size-12 items-center justify-center rounded-full',
          tone === 'danger' ? 'bg-danger/10 text-danger' : 'bg-primary-light text-primary',
        )}
      >
        <Icon className="size-6" aria-hidden="true" />
      </span>

      <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
      <p className="max-w-prose text-sm text-neutral-900/70">{body}</p>

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className={cn(
            'mt-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white',
            'transition-colors hover:bg-primary/90',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          )}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
