import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CalendarClock, SearchX } from 'lucide-react'
import { toast } from 'sonner'

import { AdminAppointmentTable } from '../components/admin/AdminAppointmentTable'
import { AppointmentFilters } from '../components/admin/AppointmentFilters'
import { CancelAppointmentDialog } from '../components/admin/CancelAppointmentDialog'
import { PageHeader } from '../components/common/PageHeader'
import { StateMessage } from '../components/common/StateMessage'
import { ServiceListSkeleton } from '../components/service/ServiceListSkeleton'
import { useI18n } from '../hooks/useI18n'
import { useStore } from '../store/store'
import { translate, type StringKey } from '../i18n/strings'
import { ADMIN_HOME_ROUTE } from '../components/ProtectedRoute'
import { cn } from '../lib/utils'
import type { AdminAppointment, AppointmentActionOutcome } from '../types/appointment.types'

/**
 * Screen 7 — Admin Appointments (PRD F9-F11). Sits behind ProtectedRoute, and
 * every call it makes goes through api-gateway, which is the side that actually
 * decides whether the Admin may read this list or write to it. The guard here
 * only saves a wasted round-trip; it is not the security boundary.
 *
 * A filterable list rather than a calendar grid: a single-groomer clinic's
 * volume does not need a calendar's visual density, and a list is far cheaper to
 * make genuinely keyboard-navigable and screen-reader-legible than a custom grid
 * (plan 013, Open Question 1).
 *
 * The store owns the list and both transitions; this page owns only the filter
 * and which dialog is open. After a successful write the store already holds the
 * server's record, so nothing here re-sets it — a page that patched the row
 * itself would be showing what it hoped happened rather than what did.
 *
 * A conflict (409) and a 404 are the two write failures treated as their own
 * cases rather than as faults: both mean the list went stale between loading and
 * writing — another tab, another session — so the list is reloaded rather than
 * the Admin being invited to retry something that can never succeed
 * (.rule/error-handling-rules.md).
 */
export function AdminAppointmentsPage() {
  const { t } = useI18n()

  const appointments = useStore((state) => state.adminAppointments)
  const isLoading = useStore((state) => state.isLoadingAdminAppointments)
  const hasError = useStore((state) => state.hasAdminAppointmentsError)
  const isSaving = useStore((state) => state.isSavingAppointment)
  const loadAdminAppointments = useStore((state) => state.loadAdminAppointments)
  const confirmAppointment = useStore((state) => state.confirmAppointment)
  const cancelAppointment = useStore((state) => state.cancelAppointment)

  // The filter lives here rather than being read back from the store, so typing
  // in the date field is never a round-trip behind a re-render.
  const [filter, setFilter] = useState(() => useStore.getState().appointmentFilter)
  const [pendingCancel, setPendingCancel] = useState<AdminAppointment | null>(null)

  const hasFilter = Boolean(filter.date || filter.status)

  const handleLoad = useCallback(async () => {
    try {
      await loadAdminAppointments(filter)
    } catch {
      // The locale is read at failure time rather than closed over, so this
      // callback stays stable and switching language never refires the fetch.
      toast.error(translate(useStore.getState().locale, 'adminAppointments.error.toast'))
    }
  }, [loadAdminAppointments, filter])

  // Re-runs whenever the filter changes, which is exactly when the visible list
  // is no longer the list that was asked for.
  useEffect(() => {
    void handleLoad()
  }, [handleLoad])

  /**
   * Maps one transition's outcome to the single message it deserves, and
   * reloads the list on the two outcomes that mean it is out of date.
   */
  const reportOutcome = useCallback(
    (outcome: AppointmentActionOutcome, successKey: StringKey, failureKey: StringKey) => {
      const locale = useStore.getState().locale

      if (outcome === 'updated') {
        toast.success(translate(locale, successKey))
        return
      }

      if (outcome === 'conflict') {
        toast.error(translate(locale, 'adminAppointments.conflict.toast'))
        void handleLoad()
        return
      }

      if (outcome === 'not-found') {
        toast.error(translate(locale, 'adminAppointments.missing.toast'))
        void handleLoad()
        return
      }

      toast.error(translate(locale, failureKey))
    },
    [handleLoad],
  )

  const handleConfirm = async (appointment: AdminAppointment) => {
    const outcome = await confirmAppointment(appointment.id)

    reportOutcome(
      outcome,
      'adminAppointments.confirm.toast',
      'adminAppointments.confirm.errorToast',
    )
  }

  const handleCancel = async (appointment: AdminAppointment) => {
    const outcome = await cancelAppointment(appointment.id)

    // The dialog closes on every settled outcome, not just success: the
    // question it asked has been answered either way, and the toast carries
    // what happened.
    setPendingCancel(null)
    reportOutcome(outcome, 'adminAppointments.cancel.toast', 'adminAppointments.cancel.errorToast')
  }

  return (
    <main id="main-content" className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
      <div className="mb-6 md:mb-8">
        <PageHeader
          title={t('adminAppointments.title')}
          subtitle={t('adminAppointments.subtitle')}
        />
      </div>

      <div className="mb-6">
        <AppointmentFilters value={filter} isBusy={isLoading} onChange={setFilter} />
      </div>

      {/* One live region around every outcome, so a screen reader hears the
          filtered list arriving, the empty message, or the failure without
          re-navigating. */}
      <section aria-live="polite" aria-busy={isLoading} aria-label={t('adminAppointments.regionLabel')}>
        {isLoading ? (
          <>
            <span className="sr-only">{t('adminAppointments.loading')}</span>
            <ServiceListSkeleton />
          </>
        ) : hasError ? (
          <StateMessage
            icon={AlertTriangle}
            tone="danger"
            title={t('adminAppointments.error.title')}
            body={t('adminAppointments.error.body')}
            actionLabel={t('common.retry')}
            onAction={() => void handleLoad()}
          />
        ) : appointments.length === 0 ? (
          // An empty diary and a filter that matched nothing are different
          // problems, and only one of them has an action worth offering.
          hasFilter ? (
            <StateMessage
              icon={SearchX}
              title={t('adminAppointments.filtered.title')}
              body={t('adminAppointments.filtered.body')}
              actionLabel={t('adminAppointments.filtered.action')}
              onAction={() => setFilter({})}
            />
          ) : (
            <StateMessage
              icon={CalendarClock}
              title={t('adminAppointments.empty.title')}
              body={t('adminAppointments.empty.body')}
            />
          )
        ) : (
          <>
            <p className="mb-3 text-sm text-neutral-900/70">
              {appointments.length === 1
                ? t('adminAppointments.countOne')
                : t('adminAppointments.count', { count: appointments.length })}
            </p>

            <AdminAppointmentTable
              appointments={appointments}
              isBusy={isSaving}
              onConfirm={(appointment) => void handleConfirm(appointment)}
              onCancel={(appointment) => setPendingCancel(appointment)}
            />
          </>
        )}
      </section>

      <Link
        to={ADMIN_HOME_ROUTE}
        className={cn(
          'mt-6 inline-flex items-center gap-2 rounded-xl px-4 py-2.5',
          'text-sm font-semibold text-primary transition-colors hover:bg-primary-light',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        )}
      >
        {/* Points back toward the previous screen in both directions. */}
        <ArrowRight className="size-4 shrink-0 rotate-180 rtl:rotate-0" aria-hidden="true" />
        {t('adminAppointments.back')}
      </Link>

      {pendingCancel && (
        <CancelAppointmentDialog
          appointment={pendingCancel}
          isSubmitting={isSaving}
          onCancel={() => {
            // Closing mid-request would leave the Admin with no idea whether
            // the cancellation landed.
            if (isSaving) return
            setPendingCancel(null)
          }}
          onConfirm={() => void handleCancel(pendingCancel)}
        />
      )}
    </main>
  )
}
