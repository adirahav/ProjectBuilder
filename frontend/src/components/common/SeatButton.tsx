import type { Seat } from '../../types/seat.types'
import { cn } from '../../lib/utils'
import {
  formatSeatAriaLabel,
  isSeatRequestable,
  seatStatusIcons,
  seatStatusStyles,
} from '../../utils/seat.utils'

/**
 * A single seat in the map (44×44, `rounded-lg`, 2px border — mockup
 * `docs/design/mockups/passenger-view.html` `.seat`).
 *
 * Accessibility (PRD AC-3/AC-17, `accessibility-layer`): the status is carried
 * by a distinct Lucide icon **and** by the spelled-out status inside the
 * `aria-label` — the fill/border color is only ever a third, redundant signal.
 * The four fills also differ in lightness, so they stay separable in grayscale.
 *
 * A non-requestable seat is `aria-disabled`, not `disabled`: a `disabled`
 * button drops out of the tab order entirely, which would hide most of the bus
 * from a keyboard or screen-reader user. It stays focusable and announced, and
 * simply does nothing when activated.
 *
 * Shared by the passenger view (Screen 3) and the admin Seat Management tab
 * (Screen 4a, plan 009). The admin tab renders it without `onSelect`, which
 * makes every seat inert and drops the "לחצו לשליחת בקשה" call to action from
 * the accessible name — a read-only view must not announce an action it cannot
 * perform.
 */
type SeatButtonProps = {
  seat: Seat
  /** Omitted in read-only (admin) mode — every seat then renders inert. */
  onSelect?: (seat: Seat) => void
  /** Suppresses interaction while a request is in flight. */
  isBusy?: boolean
}

export function SeatButton({ seat, onSelect, isBusy = false }: SeatButtonProps) {
  const isInteractive = Boolean(onSelect)
  const isRequestable = isInteractive && isSeatRequestable(seat)
  const Icon = seatStatusIcons[seat.status]

  return (
    <button
      type="button"
      onClick={() => {
        if (!onSelect || !isRequestable || isBusy) return
        onSelect(seat)
      }}
      aria-disabled={!isRequestable || isBusy}
      aria-label={formatSeatAriaLabel(seat, isInteractive)}
      className={cn(
        'flex size-11 shrink-0 flex-col items-center justify-center gap-px rounded-lg border-2',
        'text-caption font-semibold transition duration-300 ease-out',
        seatStatusStyles[seat.status],
        isRequestable && !isBusy
          ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md'
          : 'cursor-default',
        isBusy && 'opacity-45',
      )}
    >
      <Icon aria-hidden="true" className="size-3" />
      <span aria-hidden="true" className="numeral">
        {seat.label}
      </span>
    </button>
  )
}
