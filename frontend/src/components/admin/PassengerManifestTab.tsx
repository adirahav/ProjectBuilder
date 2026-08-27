import { useEffect, useMemo, useState } from 'react'
import { ClipboardCopy, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { SelectField } from '../form/SelectField'
import { TextField } from '../form/TextField'
import { EmptyPanel, ErrorPanel, LoadingPanel } from '../common/StatePanel'
import { TourBusSelector } from '../common/TourBusSelector'
import { NetworkError } from '../../services/http.service'
import { manifestService } from '../../services/manifest.service'
import { cn } from '../../lib/utils'
import { useStore } from '../../store/store'
import type { ManifestStatusFilter } from '../../types/manifest.types'
import {
  EMPTY_FIELD,
  buildStatusFilterOptions,
  filterManifestRows,
  formatManifestReport,
  sortManifestRows,
} from '../../utils/manifest.utils'
import { seatStatusIcons, seatStatusLabels, seatStatusStyles } from '../../utils/seat.utils'

/**
 * Tab 4c — Passenger Manifest Report (plan 009, Step 8 / PRD F15, F16, AC-14).
 *
 * The one admin surface that shows passenger PII. It reads from the
 * admin-authenticated `GET /api/buses/:busId/manifest` via `manifest.service.ts`
 * — never from the public seat-map endpoint, which deliberately carries no
 * identity fields.
 *
 * The status filter and free-text search run client-side over the rows already
 * fetched (plan 009 §Scope), so narrowing the table costs no request and the
 * table stays responsive while typing.
 *
 * "Copy report" formats **only the currently visible rows**, so a copied report
 * can never contain rows the admin filtered out and cannot see.
 *
 * Copy feedback renders as an inline `aria-live` message rather than a toast:
 * `sonner` is reserved for outcomes that required a network round-trip
 * (.rule/error-handling-rules.md), and the clipboard write is purely local.
 */

const COPY_SUCCESS = 'הדוח הועתק ללוח'
const COPY_FAILURE = 'העתקה ללוח נכשלה. נסו לסמן ולהעתיק ידנית'

export function PassengerManifestTab() {
  const selectedBusId = useStore((state) => state.selectedBusId)
  const manifest = useStore((state) => state.manifest)

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [reloadToken, setReloadToken] = useState(0)
  const [statusFilter, setStatusFilter] = useState<ManifestStatusFilter>('all')
  const [query, setQuery] = useState('')
  const [copyMessage, setCopyMessage] = useState<
    { tone: 'success' | 'error'; text: string } | undefined
  >()

  useEffect(() => {
    if (!selectedBusId) return
    const controller = new AbortController()

    async function loadManifest(busId: string) {
      setIsLoading(true)
      setError(undefined)
      try {
        await manifestService.getManifest(busId, controller.signal)
      } catch (err) {
        if (controller.signal.aborted) return
        const message =
          err instanceof NetworkError
            ? 'אין חיבור לשרת. נסו שוב בעוד רגע'
            : 'טעינת רשימת הנוסעים נכשלה'
        setError(message)
        toast.error(message)
        console.log('[MANIFEST] failed to load manifest', busId, err)
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    void loadManifest(selectedBusId)
    return () => controller.abort()
  }, [selectedBusId, reloadToken])

  // Switching buses must not silently carry the previous bus's filters over —
  // an empty table would then look like "no passengers" rather than "filtered".
  //
  // Adjusted during render rather than in an effect (React's documented pattern
  // for "reset state when a prop changes"): an effect would paint one frame of
  // the new bus's rows through the old bus's filter first.
  const [filteredBusId, setFilteredBusId] = useState(selectedBusId)
  if (filteredBusId !== selectedBusId) {
    setFilteredBusId(selectedBusId)
    setStatusFilter('all')
    setQuery('')
    setCopyMessage(undefined)
  }

  const visibleRows = useMemo(() => {
    if (!manifest) return []
    return sortManifestRows(filterManifestRows(manifest.rows, { status: statusFilter, query }))
  }, [manifest, statusFilter, query])

  async function handleCopyReport() {
    if (!manifest || visibleRows.length === 0) return

    const report = formatManifestReport(manifest.bus, visibleRows)
    try {
      await navigator.clipboard.writeText(report)
      setCopyMessage({ tone: 'success', text: COPY_SUCCESS })
      console.log('[MANIFEST] report copied', manifest.bus.id, visibleRows.length)
    } catch (err) {
      setCopyMessage({ tone: 'error', text: COPY_FAILURE })
      console.log('[MANIFEST] clipboard write failed', err)
    }
  }

  const isFiltered = statusFilter !== 'all' || query.trim().length > 0

  return (
    <div className="flex flex-col gap-6">
      <TourBusSelector>
        {manifest ? (
          <>
            <span
              aria-live="polite"
              className="rounded-full bg-primary-100 px-3 py-1 text-caption font-medium text-primary-700"
            >
              מוצגות <span className="numeral">{visibleRows.length}</span> מתוך{' '}
              <span className="numeral">{manifest.rows.length}</span> שורות
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

      {!selectedBusId ? (
        <EmptyPanel message="בחרו טיול ואוטובוס כדי לראות את רשימת הנוסעים." />
      ) : isLoading && !manifest ? (
        <LoadingPanel message="טוען את רשימת הנוסעים…" />
      ) : error && !manifest ? (
        <ErrorPanel message={error} onRetry={() => setReloadToken((token) => token + 1)} />
      ) : manifest && manifest.rows.length === 0 ? (
        <EmptyPanel message="לאוטובוס הזה עדיין לא הוגדרו מושבים." />
      ) : manifest ? (
        <section
          aria-label="רשימת נוסעים"
          className="rounded-xl border border-n-100 bg-n-0 p-4 shadow-sm md:p-6"
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="md:w-56">
              <SelectField
                id="manifest-status"
                label="סינון לפי סטטוס"
                value={statusFilter}
                onChange={(value) => setStatusFilter(value as ManifestStatusFilter)}
                options={buildStatusFilterOptions()}
              />
            </div>

            <div className="flex-1">
              <TextField
                id="manifest-search"
                label="חיפוש"
                value={query}
                onChange={setQuery}
                placeholder="שם, טלפון או נקודת איסוף"
                hint="החיפוש פועל על השורות שכבר נטענו — ללא פנייה נוספת לשרת."
              />
            </div>

            <button
              type="button"
              onClick={handleCopyReport}
              disabled={visibleRows.length === 0}
              className={cn(
                'flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-4',
                'bg-primary-700 text-label font-medium text-n-0 transition hover:bg-primary-900',
                'disabled:cursor-not-allowed disabled:opacity-45',
              )}
            >
              <ClipboardCopy aria-hidden="true" className="size-4" />
              העתקת דוח
            </button>
          </div>

          <p
            aria-live="polite"
            className={cn(
              'mt-2 min-h-4 text-caption font-medium',
              copyMessage?.tone === 'error' ? 'text-danger-600' : 'text-success-600',
            )}
          >
            {copyMessage?.text ?? ''}
          </p>

          {visibleRows.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-n-200 p-6 text-center text-label text-n-500">
              {isFiltered
                ? 'אין שורות שמתאימות לסינון הנוכחי.'
                : 'אין נוסעים רשומים לאוטובוס הזה.'}
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-start">
                <caption className="sr-only">
                  רשימת הנוסעים של {manifest.bus.name}: מושב, שם, טלפון, נקודת איסוף וסטטוס
                </caption>
                <thead>
                  <tr className="border-b border-n-200 text-caption text-n-500">
                    <th scope="col" className="p-2 text-start font-medium">
                      מושב
                    </th>
                    <th scope="col" className="p-2 text-start font-medium">
                      שם הנוסע
                    </th>
                    <th scope="col" className="p-2 text-start font-medium">
                      טלפון
                    </th>
                    <th scope="col" className="p-2 text-start font-medium">
                      נקודת איסוף
                    </th>
                    <th scope="col" className="p-2 text-start font-medium">
                      סטטוס
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const Icon = seatStatusIcons[row.status]
                    return (
                      <tr key={row.seatId} className="border-b border-n-100 last:border-b-0">
                        <th
                          scope="row"
                          className="p-2 text-start text-label font-semibold text-primary-900"
                        >
                          <span className="numeral">{row.seatLabel}</span>
                        </th>
                        <td className="p-2 text-label text-n-900">
                          {row.fullName || EMPTY_FIELD}
                        </td>
                        <td className="p-2 text-label text-n-700">
                          {row.phone ? (
                            <a href={`tel:${row.phone}`} className="numeral hover:underline">
                              {row.phone}
                            </a>
                          ) : (
                            EMPTY_FIELD
                          )}
                        </td>
                        <td className="p-2 text-label text-n-700">
                          {row.pickupPoint || EMPTY_FIELD}
                        </td>
                        <td className="p-2">
                          {/* Icon + text, never colour alone (PRD AC-17). */}
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full border px-2 py-1',
                              'text-caption font-medium',
                              seatStatusStyles[row.status],
                            )}
                          >
                            <Icon aria-hidden="true" className="size-3" />
                            {seatStatusLabels[row.status]}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  )
}
