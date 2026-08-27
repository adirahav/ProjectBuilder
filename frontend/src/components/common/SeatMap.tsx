import { DoorOpen, Milestone, UserRound } from 'lucide-react'
import type { Seat, SeatMap as SeatMapData } from '../../types/seat.types'
import { cn } from '../../lib/utils'
import { buildSeatRows } from '../../utils/seat.utils'
import { SeatButton } from './SeatButton'

/**
 * The interactive seat map (F3, mockup §מפת מושבים).
 *
 * Purely presentational: it renders whatever the server last returned and
 * reports clicks upward. It never derives or mutates a seat's status — the
 * server is the sole source of truth (PRD NFR).
 *
 * Layout comes from the bus's own metadata (`aisleAfterColumn`, `doorRow`,
 * `backRow`) rather than from hardcoded row arithmetic, so a bus with a
 * different template renders correctly without a code change here.
 *
 * Shared by the passenger view (Screen 3) and the admin Seat Management tab
 * (Screen 4a). Omitting `onSelectSeat` renders the map read-only: every seat
 * becomes inert and stops announcing an action it cannot perform. The admin
 * quick actions (approve/release/reserve) are a separate ticket (F6–F10).
 */
type SeatMapProps = {
  seatMap: SeatMapData
  /** Omitted in read-only (admin) mode — every seat then renders inert. */
  onSelectSeat?: (seat: Seat) => void
  /** A seat request is in flight — the whole map is inert until it settles. */
  isBusy?: boolean
}

export function SeatMap({ seatMap, onSelectSeat, isBusy = false }: SeatMapProps) {
  const rows = buildSeatRows(seatMap.seats, seatMap.bus)

  return (
    <section
      aria-label="מפת מושבים"
      className="rounded-xl border border-n-100 bg-n-0 p-4 shadow-sm md:p-6"
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-h2 text-primary-900">מפת מושבים</h2>
        <span className="text-caption text-n-400">
          {seatMap.bus.name} · <span className="numeral">{seatMap.bus.seatCount}</span> מקומות
        </span>
      </div>

      <div className="mx-auto w-fit rounded-xl border border-n-200 bg-n-50 p-4">
        {/* Orientation row — decorative, so both markers are hidden from AT. */}
        <div className="mb-3 flex items-center justify-between gap-4 border-b border-n-200 pb-3">
          <span className="flex items-center gap-1 rounded-lg bg-n-200 px-3 py-1 text-caption font-medium text-n-700">
            <UserRound aria-hidden="true" className="size-3.5" />
            נהג
          </span>
          <span className="flex items-center gap-1 rounded-lg border border-dashed border-n-400 px-3 py-1 text-caption text-n-500">
            <Milestone aria-hidden="true" className="size-3.5" />
            חזית
          </span>
        </div>

        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={row.row}
              className={cn(
                'flex items-center gap-2',
                row.isBackRow && 'mt-2 border-t border-n-200 pt-3',
              )}
            >
              {row.seats.map((seat, index) => (
                <span key={seat.id} className="flex items-center gap-2">
                  {row.aisleAfter > 0 && index === row.aisleAfter ? (
                    <span aria-hidden="true" className="inline-block w-5" />
                  ) : null}
                  <SeatButton seat={seat} onSelect={onSelectSeat} isBusy={isBusy} />
                </span>
              ))}

              {row.hasDoor ? (
                <span
                  aria-hidden="true"
                  className="ms-2 flex h-11 w-24 items-center justify-center gap-1 rounded-lg border-2 border-dashed border-info-600 bg-info-50 text-caption font-medium text-info-600"
                >
                  <DoorOpen className="size-3.5" />
                  דלת
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
