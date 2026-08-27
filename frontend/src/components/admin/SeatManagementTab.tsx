import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { SeatLegend } from '../common/SeatLegend'
import { SeatMap } from '../common/SeatMap'
import { EmptyPanel, ErrorPanel, LoadingPanel } from '../common/StatePanel'
import { TourBusSelector } from '../common/TourBusSelector'
import { NetworkError } from '../../services/http.service'
import { seatService } from '../../services/seat.service'
import { useStore } from '../../store/store'
import { countSeatsByStatus } from '../../utils/seat.utils'

/**
 * Tab 4a — Seat Management (plan 009, Step 6).
 *
 * Scope for this pass is deliberately read-only: the same accessible seat map
 * the passenger sees (Screen 3), in an admin context, showing live status per
 * seat. The quick actions (approve / cancel / toggle-reserve) and the
 * manual-assign / swap-move modal are F6–F10 and ship in their own tickets.
 *
 * Per plan 009 Open Question 3 the deferred actions are **omitted entirely**
 * rather than rendered disabled: a greyed-out "אישור" button reads as broken
 * software, while a clean read view reads as a finished read view.
 *
 * The map is rendered by passing no `onSelectSeat`, which makes every seat inert
 * and drops the "לחצו לשליחת בקשה" call to action from its accessible name — a
 * read-only view must not announce an action it cannot perform.
 */
export function SeatManagementTab() {
  const selectedBusId = useStore((state) => state.selectedBusId)
  const seatMap = useStore((state) => state.seatMap)

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [reloadToken, setReloadToken] = useState(0)

  const loadSeatMap = useCallback(async (busId: string, signal?: AbortSignal) => {
    setIsLoading(true)
    setError(undefined)
    try {
      await seatService.getSeatMap(busId, signal)
    } catch (err) {
      if (signal?.aborted) return
      const message =
        err instanceof NetworkError
          ? 'אין חיבור לשרת. נסו שוב בעוד רגע'
          : 'טעינת מפת המושבים נכשלה'
      setError(message)
      toast.error(message)
      console.log('[ADMIN] failed to load seat map', busId, err)
    } finally {
      if (!signal?.aborted) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!selectedBusId) return
    const controller = new AbortController()

    async function load(busId: string) {
      await loadSeatMap(busId, controller.signal)
    }

    void load(selectedBusId)
    return () => controller.abort()
  }, [selectedBusId, reloadToken, loadSeatMap])

  const availableCount = seatMap ? countSeatsByStatus(seatMap.seats, 'available') : 0
  const pendingCount = seatMap ? countSeatsByStatus(seatMap.seats, 'pending') : 0

  return (
    <div className="flex flex-col gap-6">
      <TourBusSelector>
        {seatMap ? (
          <>
            <span
              aria-live="polite"
              className="rounded-full bg-primary-100 px-3 py-1 text-caption font-medium text-primary-700"
            >
              <span className="numeral">{availableCount}</span> מושבים פנויים
            </span>
            <span className="rounded-full bg-warning-50 px-3 py-1 text-caption font-medium text-warning-600">
              <span className="numeral">{pendingCount}</span> ממתינים לאישור
            </span>
            <button
              type="button"
              onClick={() => setReloadToken((token) => token + 1)}
              className="ms-auto flex h-9 items-center gap-2 rounded-lg border border-n-200 bg-n-0 px-3 text-caption font-medium text-n-700 transition hover:bg-n-50"
            >
              <RefreshCw aria-hidden="true" className="size-3.5" />
              רענון
            </button>
          </>
        ) : null}
      </TourBusSelector>

      <SeatLegend />

      {!selectedBusId ? (
        <EmptyPanel message="בחרו טיול ואוטובוס כדי לראות את מפת המושבים." />
      ) : isLoading && !seatMap ? (
        <LoadingPanel message="טוען את מפת המושבים…" />
      ) : error && !seatMap ? (
        <ErrorPanel message={error} onRetry={() => setReloadToken((token) => token + 1)} />
      ) : seatMap && seatMap.seats.length === 0 ? (
        <EmptyPanel message="לאוטובוס הזה עדיין לא הוגדרו מושבים." />
      ) : seatMap ? (
        <>
          <SeatMap seatMap={seatMap} />
          <p className="text-caption text-n-400">
            תצוגה בלבד. פעולות מהירות על מושב (אישור, שחרור, שמירה) ייבנו בכרטיס נפרד.
          </p>
        </>
      ) : null}
    </div>
  )
}
