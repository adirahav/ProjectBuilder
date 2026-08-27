import { useCallback, useEffect, useState } from 'react'
import { Bus as BusIcon, CalendarDays, ChevronDown, Loader2, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyPanel, ErrorPanel, LoadingPanel } from '../common/StatePanel'
import { busService } from '../../services/bus.service'
import { NetworkError } from '../../services/http.service'
import { tourService } from '../../services/tour.service'
import { cn } from '../../lib/utils'
import { useStore } from '../../store/store'
import type { Bus } from '../../types/bus.types'
import { formatTourDate } from '../../utils/tour.utils'

/**
 * Tab 4b — Tours & Buses (plan 009, Step 7).
 *
 * Read-only for this pass: tours listed with their buses expandable underneath,
 * from the existing `GET /api/tours` and `GET /api/tours/:tourId/buses`. Tour and
 * bus CRUD and bus-type template management are F11–F14 and ship in their own
 * tickets; per plan 009 Open Question 3 their buttons are omitted rather than
 * rendered disabled.
 *
 * Bus lists live in local state keyed by tour id, not in the `bus` slice: more
 * than one tour can be expanded at once, which the single `buses` slice cannot
 * represent, and writing to it would clobber the tour/bus selection the other
 * two tabs share. Each tour's buses are fetched once, on first expand, and kept
 * — collapsing is a display change, not a reason to re-fetch.
 */

/** Per-tour bus-list fetch state, so one tour's failure never blanks another. */
type BusListState = {
  status: 'loading' | 'loaded' | 'error'
  buses: Bus[]
}

export function ToursBusesTab() {
  const tours = useStore((state) => state.tours)

  const [isLoadingTours, setIsLoadingTours] = useState(true)
  const [toursError, setToursError] = useState<string | undefined>()
  const [expandedTourIds, setExpandedTourIds] = useState<string[]>([])
  const [busLists, setBusLists] = useState<Record<string, BusListState>>({})
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
        console.log('[ADMIN] failed to load tours', err)
      } finally {
        if (!controller.signal.aborted) setIsLoadingTours(false)
      }
    }

    void loadTours()
    return () => controller.abort()
  }, [reloadToken])

  const loadBuses = useCallback(async (tourId: string) => {
    setBusLists((current) => ({ ...current, [tourId]: { status: 'loading', buses: [] } }))
    try {
      const buses = await busService.listBusesForTour(tourId)
      setBusLists((current) => ({ ...current, [tourId]: { status: 'loaded', buses } }))
    } catch (err) {
      setBusLists((current) => ({ ...current, [tourId]: { status: 'error', buses: [] } }))
      const message =
        err instanceof NetworkError
          ? 'אין חיבור לשרת. נסו שוב בעוד רגע'
          : 'טעינת רשימת האוטובוסים נכשלה'
      toast.error(message)
      console.log('[ADMIN] failed to load buses for tour', tourId, err)
    }
  }, [])

  function toggleTour(tourId: string) {
    const isExpanded = expandedTourIds.includes(tourId)
    setExpandedTourIds((current) =>
      isExpanded ? current.filter((id) => id !== tourId) : [...current, tourId],
    )
    // Fetch once, on first expand. A previous failure is worth retrying.
    if (!isExpanded && busLists[tourId]?.status !== 'loaded') void loadBuses(tourId)
  }

  if (isLoadingTours && tours.length === 0) {
    return <LoadingPanel message="טוען את רשימת הטיולים…" />
  }

  if (toursError && tours.length === 0) {
    return <ErrorPanel message={toursError} onRetry={() => setReloadToken((token) => token + 1)} />
  }

  if (tours.length === 0) {
    return <EmptyPanel message="עדיין לא הוגדרו טיולים." />
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-caption text-n-400">
        תצוגה בלבד. הוספה, עריכה ומחיקה של טיולים, אוטובוסים ותבניות ייבנו בכרטיס נפרד.
      </p>

      <ul className="flex flex-col gap-3">
        {tours.map((tour) => {
          const isExpanded = expandedTourIds.includes(tour.id)
          const busList = busLists[tour.id]
          const panelId = `tour-buses-${tour.id}`

          return (
            <li
              key={tour.id}
              className="overflow-hidden rounded-xl border border-n-100 bg-n-0 shadow-sm"
            >
              <h3>
                <button
                  type="button"
                  onClick={() => toggleTour(tour.id)}
                  aria-expanded={isExpanded}
                  aria-controls={panelId}
                  className="flex w-full items-center gap-3 p-4 text-start transition hover:bg-n-50"
                >
                  <span
                    aria-hidden="true"
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-700"
                  >
                    <BusIcon className="size-4" />
                  </span>

                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-label font-medium text-primary-900">
                      {tour.name}
                    </span>
                    <span className="flex items-center gap-1 text-caption text-n-500">
                      <CalendarDays aria-hidden="true" className="size-3.5" />
                      <span className="numeral">{formatTourDate(tour.startDate)}</span>
                      {tour.endDate ? (
                        <>
                          <span aria-hidden="true">–</span>
                          <span className="numeral">{formatTourDate(tour.endDate)}</span>
                        </>
                      ) : null}
                    </span>
                  </span>

                  <ChevronDown
                    aria-hidden="true"
                    className={cn(
                      'size-4 shrink-0 text-n-400 transition-transform duration-200',
                      isExpanded && 'rotate-180',
                    )}
                  />
                </button>
              </h3>

              {isExpanded ? (
                <div id={panelId} className="border-t border-n-100 bg-n-50 p-4">
                  {busList?.status === 'loading' ? (
                    <p role="status" className="flex items-center gap-2 text-caption text-n-500">
                      <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                      טוען אוטובוסים…
                    </p>
                  ) : busList?.status === 'error' ? (
                    <ErrorPanel
                      message="טעינת רשימת האוטובוסים נכשלה"
                      onRetry={() => void loadBuses(tour.id)}
                    />
                  ) : busList && busList.buses.length === 0 ? (
                    <p className="text-caption text-n-500">
                      לטיול הזה עדיין לא הוגדרו אוטובוסים.
                    </p>
                  ) : busList ? (
                    <ul className="flex flex-col gap-3">
                      {busList.buses.map((bus) => (
                        <li
                          key={bus.id}
                          className="rounded-lg border border-n-200 bg-n-0 p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-label font-medium text-n-900">{bus.name}</span>
                            <span className="rounded-full bg-primary-100 px-3 py-1 text-caption font-medium text-primary-700">
                              <span className="numeral">{bus.seatCount}</span> מקומות
                            </span>
                          </div>

                          {bus.pickupPoints.length > 0 ? (
                            <ul className="mt-2 flex flex-wrap gap-2">
                              {bus.pickupPoints.map((pickupPoint) => (
                                <li
                                  key={pickupPoint}
                                  className="flex items-center gap-1 rounded-full bg-n-100 px-2 py-1 text-caption text-n-700"
                                >
                                  <MapPin aria-hidden="true" className="size-3" />
                                  {pickupPoint}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-2 text-caption text-n-400">
                              לא הוגדרו נקודות איסוף לאוטובוס הזה.
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
