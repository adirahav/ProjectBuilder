import { useId } from 'react'
import { ChevronRight, CalendarDays } from 'lucide-react'

import { cn } from '../../lib/utils'
import { useI18n } from '../../hooks/useI18n'
import { formatDateLabel, isDateKey, shiftDateKey, todayKey } from '../../utils/date.utils'

interface DatePickerProps {
  /** The selected calendar day, `YYYY-MM-DD`. */
  value: string
  onChange: (date: string) => void
}

const stepButtonClasses = cn(
  'flex size-11 shrink-0 items-center justify-center rounded-xl border border-neutral-900/10',
  'bg-white text-neutral-900 transition-colors hover:bg-primary-light hover:text-primary',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
  'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-neutral-900',
)

/**
 * Day selector for the picker: a native date field plus previous/next steppers.
 *
 * The native input is deliberate — it gives every platform (and Android via
 * Capacitor) its own accessible, localized calendar for free, which a bespoke
 * calendar grid would have to re-earn keyboard support and screen-reader
 * semantics for.
 *
 * Past days are unbookable, so today is the floor: `min` blocks the native
 * picker and the stepper disables itself rather than letting the Customer walk
 * into a day that can only ever be empty.
 */
export function DatePicker({ value, onChange }: DatePickerProps) {
  const { locale, t } = useI18n()
  const inputId = useId()

  const today = todayKey()
  const isAtFloor = value <= today

  const handleStep = (days: number) => {
    const next = shiftDateKey(value, days)
    if (next < today) return

    onChange(next)
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-neutral-900/10 bg-white p-4 md:p-5">
      <label htmlFor={inputId} className="text-sm font-semibold text-neutral-900">
        {t('timeSlot.dateLabel')}
      </label>

      <div className="flex items-center gap-2">
        {/* Chevrons point at the day they move to: in RTL "previous" is the
            right-hand arrow, so both are mirrored with the document. */}
        <button
          type="button"
          onClick={() => handleStep(-1)}
          disabled={isAtFloor}
          aria-label={t('timeSlot.previousDay')}
          className={stepButtonClasses}
        >
          <ChevronRight className="size-5 rotate-180 rtl:rotate-0" aria-hidden="true" />
        </button>

        <div className="relative flex min-w-0 flex-1 items-center">
          <CalendarDays
            className="pointer-events-none absolute start-3 size-4 text-primary"
            aria-hidden="true"
          />
          <input
            id={inputId}
            type="date"
            value={value}
            min={today}
            onChange={(ev) => {
              // The native field can report an empty or partial value while the
              // Customer is still typing; only a real calendar day is worth a fetch.
              if (isDateKey(ev.target.value)) onChange(ev.target.value)
            }}
            className={cn(
              'w-full rounded-xl border border-neutral-900/10 bg-white py-2.5 ps-9 pe-3',
              'text-base font-medium text-neutral-900',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            )}
          />
        </div>

        <button
          type="button"
          onClick={() => handleStep(1)}
          aria-label={t('timeSlot.nextDay')}
          className={stepButtonClasses}
        >
          <ChevronRight className="size-5 rtl:rotate-180" aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* The written-out date backs up the numeric field, which reads poorly
            aloud and differs per platform. */}
        <p className="text-sm text-neutral-900/70">{formatDateLabel(value, locale)}</p>

        <button
          type="button"
          onClick={() => onChange(today)}
          disabled={value === today}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-semibold text-primary transition-colors',
            'hover:bg-primary-light',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
          )}
        >
          {t('timeSlot.today')}
        </button>
      </div>
    </div>
  )
}
