import { useId } from 'react'
import { CalendarDays, FilterX } from 'lucide-react'

import { useI18n } from '../../hooks/useI18n'
import { cn } from '../../lib/utils'
import { isDateKey, todayKey } from '../../utils/date.utils'
import {
  APPOINTMENT_STATUSES,
  appointmentStatusLabelKeys,
} from '../../utils/appointmentStatus.utils'
import type { AppointmentFilter, AppointmentStatus } from '../../types/appointment.types'

interface AppointmentFiltersProps {
  value: AppointmentFilter
  /** True while the list is loading — the controls stay usable, but say so. */
  isBusy: boolean
  onChange: (filter: AppointmentFilter) => void
}

const controlClasses = cn(
  'w-full rounded-xl border border-neutral-900/10 bg-white py-2.5 px-3',
  'text-base font-medium text-neutral-900',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
)

/**
 * The Admin's two ways of narrowing the Appointments list (PRD F9): a day and a
 * status. They are deliberately independent — neither implies the other, and
 * clearing one must not clear the other.
 *
 * Both are native controls. A `<select>` and a `type="date"` field come with
 * every platform's own accessible, localized picker and full keyboard support
 * already earned; a bespoke dropdown or calendar grid would have to re-earn all
 * of it, and this screen has no need a native control cannot meet
 * (accessibility-layer).
 *
 * Unlike the customer-facing DatePicker there is no `min`: the Admin genuinely
 * needs to look at yesterday. A past day is history here, not an unbookable
 * dead end.
 *
 * "Any date"/"Any status" are real options rather than an empty field the Admin
 * has to guess at, because *absence* of a filter is a state worth naming.
 */
export function AppointmentFilters({ value, isBusy, onChange }: AppointmentFiltersProps) {
  const { t } = useI18n()

  const dateId = useId()
  const statusId = useId()

  const hasFilter = Boolean(value.date || value.status)

  return (
    <fieldset
      className="flex flex-col gap-4 rounded-2xl border border-neutral-900/10 bg-white p-4 md:p-5"
      aria-busy={isBusy}
    >
      <legend className="px-1 text-sm font-semibold text-neutral-900">
        {t('adminAppointments.filter.legend')}
      </legend>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
        <div className="flex flex-col gap-2">
          <label htmlFor={dateId} className="text-sm font-medium text-neutral-900">
            {t('adminAppointments.filter.date')}
          </label>

          <div className="relative flex items-center">
            <CalendarDays
              className="pointer-events-none absolute start-3 size-4 text-primary"
              aria-hidden="true"
            />
            <input
              id={dateId}
              type="date"
              value={value.date ?? ''}
              onChange={(ev) => {
                const next = ev.target.value

                // An emptied field means "any date", which is a filter change
                // worth acting on. A half-typed one is not yet anything.
                if (!next) {
                  onChange({ ...value, date: undefined })
                  return
                }

                if (isDateKey(next)) onChange({ ...value, date: next })
              }}
              className={cn(controlClasses, 'ps-9')}
            />
          </div>

          <button
            type="button"
            onClick={() => onChange({ ...value, date: todayKey() })}
            disabled={value.date === todayKey()}
            className={cn(
              'self-start rounded-lg px-3 py-1.5 text-sm font-semibold text-primary',
              'transition-colors hover:bg-primary-light',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
            )}
          >
            {t('adminAppointments.filter.today')}
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={statusId} className="text-sm font-medium text-neutral-900">
            {t('adminAppointments.filter.status')}
          </label>

          <select
            id={statusId}
            value={value.status ?? ''}
            onChange={(ev) => {
              const next = ev.target.value
              onChange({ ...value, status: next ? (next as AppointmentStatus) : undefined })
            }}
            className={controlClasses}
          >
            <option value="">{t('adminAppointments.filter.anyStatus')}</option>
            {APPOINTMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(appointmentStatusLabelKeys[status])}
              </option>
            ))}
          </select>
        </div>

        {/* Absent rather than disabled when nothing is filtered: a control that
            could never do anything is noise in the tab order. */}
        {hasFilter && (
          <button
            type="button"
            onClick={() => onChange({})}
            className={cn(
              'inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-900/15 px-4 py-2.5',
              'text-sm font-semibold text-neutral-900 transition-colors hover:bg-primary-light',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            )}
          >
            <FilterX className="size-4 shrink-0" aria-hidden="true" />
            {t('adminAppointments.filter.clear')}
          </button>
        )}
      </div>
    </fieldset>
  )
}
