import type { SeatStatus } from '../../types/seat.types'
import { cn } from '../../lib/utils'
import { seatStatusIcons, seatStatusLabels, seatStatusStyles } from '../../utils/seat.utils'

/**
 * Status legend for the seat map (mockup §מקרא).
 *
 * The swatches are `aria-hidden` decoration — the adjacent text is the real
 * content, so the legend reads correctly with no color perception at all.
 */

const LEGEND_ORDER: SeatStatus[] = ['available', 'pending', 'taken', 'reserved']

export function SeatLegend() {
  return (
    <section
      aria-label="מקרא סטטוס מושבים"
      className="rounded-xl border border-n-100 bg-n-0 p-4 shadow-sm"
    >
      <h2 className="text-h2 text-primary-900">מקרא</h2>

      <ul className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {LEGEND_ORDER.map((status) => {
          const Icon = seatStatusIcons[status]
          return (
            <li key={status} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-11 shrink-0 items-center justify-center rounded-lg border-2',
                  seatStatusStyles[status],
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="text-label text-n-700">{seatStatusLabels[status]}</span>
            </li>
          )
        })}
      </ul>

      <p className="mt-3 text-caption text-n-400">
        כל מושב מסומן גם באייקון ובתווית טקסט — הצבע לעולם אינו הסימון היחיד.
      </p>
    </section>
  )
}
