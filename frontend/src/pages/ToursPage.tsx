import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Bus, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { SeatLegend } from '../components/passenger/SeatLegend'
import { SeatMap } from '../components/passenger/SeatMap'
import { SeatRequestModal } from '../components/passenger/SeatRequestModal'
import { TourBusSelector } from '../components/passenger/TourBusSelector'
import { ConflictError, NetworkError } from '../services/http.service'
import { seatService } from '../services/seat.service'
import { useStore } from '../store/store'
import type { Seat, SeatRequestFormValues } from '../types/seat.types'
import { countSeatsByStatus } from '../utils/seat.utils'
import { formatTourOption } from '../utils/tour.utils'

/**
 * Screen 3 — Passenger View (PRD F3/F4/F5, plan 007).
 *
 * No auth is involved here by design — passengers are never authenticated, and
 * every request this page makes is sent without a bearer token.
 *
 * The page owns the seat-map lifecycle and the one rule that must not be
 * scattered: **every** `request` outcome — success, conflict, or plain failure —
 * is followed by a re-fetch of the seat map, so the UI can never show a stale
 * status (.rule/error-handling-rules.md). A 409 is treated as its own expected
 * case, not a generic error (PRD F5 / AC-5).
 */

const CONFLICT_MESSAGE = 'המושב הזה כבר נתפס — בחרו מושב אחר'

export function ToursPage() {
  const tours = useStore((state) => state.tours)
  const buses = useStore((state) => state.buses)
  const selectedTourId = useStore((state) => state.selectedTourId)
  const selectedBusId = useStore((state) => state.selectedBusId)
  const seatMap = useStore((state) => state.seatMap)

  const [isLoadingSeatMap, setIsLoadingSeatMap] = useState(false)
  const [seatMapError, setSeatMapError] = useState<string | undefined>()
  const [selectedSeat, setSelectedSeat] = useState<Seat | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | undefined>()
  const [reloadToken, setReloadToken] = useState(0)

  const loadSeatMap = useCallback(async (busId: string, signal?: AbortSignal) => {
    setIsLoadingSeatMap(true)
    setSeatMapError(undefined)
    try {
      await seatService.getSeatMap(busId, signal)
    } catch (err) {
      if (signal?.aborted) return
      const message =
        err instanceof NetworkError
          ? 'אין חיבור לשרת. נסו שוב בעוד רגע'
          : 'טעינת מפת המושבים נכשלה'
      setSeatMapError(message)
      toast.error(message)
      console.log('[SEAT] failed to load seat map', busId, err)
    } finally {
      if (!signal?.aborted) setIsLoadingSeatMap(false)
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

  async function handleSubmitRequest(values: SeatRequestFormValues) {
    if (!selectedSeat || !selectedBusId || isSubmitting) return

    const seatId = selectedSeat.id
    setIsSubmitting(true)
    setSubmitError(undefined)
    try {
      await seatService.requestSeat({ seatId, ...values })
      setSelectedSeat(null)
      toast.success('הבקשה נשלחה וממתינה לאישור המנהל')
    } catch (err) {
      if (err instanceof ConflictError) {
        // Expected during normal concurrent use (F5): a distinct message, and
        // the modal stays open on the now-invalid seat so the refreshed map
        // behind it explains why.
        setSubmitError(CONFLICT_MESSAGE)
        toast.error(CONFLICT_MESSAGE)
      } else if (err instanceof NetworkError) {
        setSubmitError('אין חיבור לשרת. נסו שוב בעוד רגע')
        toast.error('אין חיבור לשרת. נסו שוב בעוד רגע')
      } else {
        setSubmitError('שליחת הבקשה נכשלה. נסו שוב')
        toast.error('שליחת הבקשה נכשלה. נסו שוב')
      }
      console.log('[SEAT] seat request failed', seatId, err)
    } finally {
      setIsSubmitting(false)
      // Re-sync after success AND after failure — the server is the only source
      // of truth for what this seat's status now is.
      await loadSeatMap(selectedBusId)
    }
  }

  const selectedTour = tours.find((tour) => tour.id === selectedTourId)
  const selectedBus = buses.find((bus) => bus.id === selectedBusId)
  const contextLabel = [selectedTour && formatTourOption(selectedTour), selectedBus?.name]
    .filter(Boolean)
    .join(' · ')

  // The modal must always describe the seat as the server last reported it —
  // if a refresh moved it out of `available`, that shows immediately.
  const modalSeat = selectedSeat
    ? (seatMap?.seats.find((seat) => seat.id === selectedSeat.id) ?? selectedSeat)
    : null

  const availableCount = seatMap ? countSeatsByStatus(seatMap.seats, 'available') : 0

  return (
    <div className="min-h-dvh pb-12">
      <header className="sticky top-0 z-30 bg-primary-900 text-n-0 shadow-md">
        <div className="mx-auto flex max-w-[900px] items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex size-8 items-center justify-center rounded-lg bg-accent-500"
            >
              <Bus className="size-4" />
            </span>
            <span className="text-body font-bold">הילה טיולים</span>
          </Link>
          <span className="rounded-full bg-n-0/10 px-3 py-1 text-caption font-medium">
            מצב נוסע
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-[900px] px-4 py-6">
        <h1 className="text-h1 text-primary-900">בחירת מושב</h1>
        <p className="mt-2 text-label text-n-500">
          בחרו טיול ואוטובוס, ולאחר מכן לחצו על מושב פנוי כדי לשלוח בקשה.
        </p>

        <div className="mt-6 flex flex-col gap-6">
          <TourBusSelector>
            {seatMap ? (
              <span
                aria-live="polite"
                className="rounded-full bg-primary-100 px-3 py-1 text-caption font-medium text-primary-700"
              >
                <span className="numeral">{availableCount}</span> מושבים פנויים
              </span>
            ) : null}
          </TourBusSelector>

          <SeatLegend />

          {!selectedBusId ? (
            <EmptyPanel message="בחרו טיול ואוטובוס כדי לראות את מפת המושבים." />
          ) : isLoadingSeatMap && !seatMap ? (
            <LoadingPanel />
          ) : seatMapError && !seatMap ? (
            <ErrorPanel
              message={seatMapError}
              onRetry={() => setReloadToken((token) => token + 1)}
            />
          ) : seatMap && seatMap.seats.length === 0 ? (
            <EmptyPanel message="לאוטובוס הזה עדיין לא הוגדרו מושבים." />
          ) : seatMap ? (
            <SeatMap
              seatMap={seatMap}
              onSelectSeat={(seat) => {
                setSubmitError(undefined)
                setSelectedSeat(seat)
              }}
              isBusy={isSubmitting}
            />
          ) : null}
        </div>
      </main>

      <SeatRequestModal
        // Remount per seat, so the form never carries another seat's input over.
        key={selectedSeat?.id ?? 'none'}
        seat={modalSeat}
        contextLabel={contextLabel}
        pickupPoints={seatMap?.bus.pickupPoints ?? []}
        isSubmitting={isSubmitting}
        submitError={submitError}
        onSubmit={handleSubmitRequest}
        onClose={() => {
          setSelectedSeat(null)
          setSubmitError(undefined)
        }}
      />
    </div>
  )
}

function LoadingPanel() {
  return (
    <p
      role="status"
      className="flex items-center justify-center gap-2 rounded-xl border border-n-100 bg-n-0 p-6 text-label text-n-500 shadow-sm"
    >
      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
      טוען את מפת המושבים…
    </p>
  )
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <p className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-n-200 bg-n-0 p-6 text-label text-n-500">
      <ArrowRight aria-hidden="true" className="size-4 text-n-400" />
      {message}
    </p>
  )
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-xl border border-n-100 bg-n-0 p-6 text-center shadow-sm"
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-danger-50 text-danger-600">
        <AlertTriangle aria-hidden="true" className="size-5" />
      </span>
      <p className="text-label text-n-700">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="flex h-10 items-center gap-2 rounded-lg border border-n-200 bg-n-0 px-4 text-label font-medium text-n-700 transition hover:bg-n-50"
      >
        <RefreshCw aria-hidden="true" className="size-4" />
        נסו שוב
      </button>
    </div>
  )
}
