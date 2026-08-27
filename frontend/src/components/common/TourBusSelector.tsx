import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { SelectField, type SelectOption } from '../form/SelectField'
import { busService } from '../../services/bus.service'
import { tourService } from '../../services/tour.service'
import { NetworkError } from '../../services/http.service'
import { useStore } from '../../store/store'
import { formatTourOption } from '../../utils/tour.utils'

/**
 * Screen 3's tour → bus selector (mockup §בחירת טיול ואוטובוס).
 *
 * Owns its own loading/error/empty states for both lists
 * (.rule/error-handling-rules.md). Selection itself is global state — the seat
 * map below reacts to it — so it lives in the `tour`/`bus` slices, while the
 * transient fetch flags stay local.
 *
 * Both fetches are abortable: switching tours quickly must not let an earlier
 * response overwrite a later one.
 */
type TourBusSelectorProps = {
  /** Rendered inside the selector card's footer (e.g. the free-seat count). */
  children?: ReactNode
}

export function TourBusSelector({ children }: TourBusSelectorProps) {
  const tours = useStore((state) => state.tours)
  const buses = useStore((state) => state.buses)
  const selectedTourId = useStore((state) => state.selectedTourId)
  const selectedBusId = useStore((state) => state.selectedBusId)
  const selectTour = useStore((state) => state.selectTour)
  const selectBus = useStore((state) => state.selectBus)

  const [isLoadingTours, setIsLoadingTours] = useState(true)
  const [isLoadingBuses, setIsLoadingBuses] = useState(false)
  const [toursError, setToursError] = useState<string | undefined>()
  const [busesError, setBusesError] = useState<string | undefined>()
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function loadTours() {
      setIsLoadingTours(true)
      setToursError(undefined)
      try {
        await tourService.getTours(controller.signal)
      } catch (err) {
        if (controller.signal.aborted) return
        const message =
          err instanceof NetworkError
            ? 'אין חיבור לשרת. נסו שוב בעוד רגע'
            : 'טעינת רשימת הטיולים נכשלה'
        setToursError(message)
        toast.error(message)
        console.log('[TOUR] failed to load tours', err)
      } finally {
        if (!controller.signal.aborted) setIsLoadingTours(false)
      }
    }

    void loadTours()
    return () => controller.abort()
  }, [reloadToken])

  useEffect(() => {
    if (!selectedTourId) return
    const controller = new AbortController()

    async function loadBuses(tourId: string) {
      setIsLoadingBuses(true)
      setBusesError(undefined)
      try {
        await busService.getBusesByTour(tourId, controller.signal)
      } catch (err) {
        if (controller.signal.aborted) return
        const message =
          err instanceof NetworkError
            ? 'אין חיבור לשרת. נסו שוב בעוד רגע'
            : 'טעינת רשימת האוטובוסים נכשלה'
        setBusesError(message)
        toast.error(message)
        console.log('[BUS] failed to load buses', err)
      } finally {
        if (!controller.signal.aborted) setIsLoadingBuses(false)
      }
    }

    void loadBuses(selectedTourId)
    return () => controller.abort()
  }, [selectedTourId, reloadToken])

  const tourOptions: SelectOption[] = tours.map((tour) => ({
    value: tour.id,
    label: formatTourOption(tour),
  }))

  const busOptions: SelectOption[] = buses.map((bus) => ({
    value: bus.id,
    label: `${bus.name} — ${bus.seatCount} מקומות`,
  }))

  const isToursEmpty = !isLoadingTours && !toursError && tours.length === 0
  const isBusesEmpty = Boolean(selectedTourId) && !isLoadingBuses && !busesError && buses.length === 0

  return (
    <section
      aria-label="בחירת טיול ואוטובוס"
      className="rounded-xl border border-n-100 bg-n-0 p-4 shadow-sm md:p-6"
    >
      <div className="flex flex-col gap-4 md:flex-row">
        <div className="flex-1">
          <SelectField
            id="tour"
            label="טיול"
            value={selectedTourId ?? ''}
            onChange={selectTour}
            options={tourOptions}
            placeholder={isLoadingTours ? 'טוען טיולים…' : 'בחרו טיול'}
            disabled={isLoadingTours || tourOptions.length === 0}
            error={toursError}
          />
        </div>

        <div className="flex-1">
          <SelectField
            id="bus"
            label="אוטובוס"
            value={selectedBusId ?? ''}
            onChange={selectBus}
            options={busOptions}
            placeholder={
              !selectedTourId
                ? 'בחרו קודם טיול'
                : isLoadingBuses
                  ? 'טוען אוטובוסים…'
                  : 'בחרו אוטובוס'
            }
            disabled={!selectedTourId || isLoadingBuses || busOptions.length === 0}
            error={busesError}
          />
        </div>
      </div>

      {isLoadingTours || isLoadingBuses ? (
        <p role="status" className="mt-4 flex items-center gap-2 text-caption text-n-500">
          <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
          {isLoadingTours ? 'טוען טיולים…' : 'טוען אוטובוסים…'}
        </p>
      ) : null}

      {isToursEmpty || isBusesEmpty ? (
        <p role="status" className="mt-4 flex items-center gap-2 text-caption text-n-500">
          <AlertTriangle aria-hidden="true" className="size-3.5 text-warning-600" />
          {isToursEmpty ? 'אין כרגע טיולים פתוחים להרשמה.' : 'לטיול הזה עדיין לא הוגדרו אוטובוסים.'}
        </p>
      ) : null}

      {toursError || busesError ? (
        <button
          type="button"
          onClick={() => setReloadToken((token) => token + 1)}
          className="mt-4 flex h-10 items-center justify-center gap-2 rounded-lg border border-n-200 bg-n-0 px-4 text-label font-medium text-n-700 transition hover:bg-n-50"
        >
          <RefreshCw aria-hidden="true" className="size-4" />
          נסו שוב
        </button>
      ) : null}

      {children ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-n-100 pt-4">
          {children}
        </div>
      ) : null}
    </section>
  )
}
