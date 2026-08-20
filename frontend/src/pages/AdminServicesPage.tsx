import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, PawPrint, Plus } from 'lucide-react'
import { toast } from 'sonner'

import { AdminServiceTable } from '../components/admin/AdminServiceTable'
import { DeactivateServiceDialog } from '../components/admin/DeactivateServiceDialog'
import { ServiceForm } from '../components/admin/ServiceForm'
import { PageHeader } from '../components/common/PageHeader'
import { StateMessage } from '../components/common/StateMessage'
import { ServiceListSkeleton } from '../components/service/ServiceListSkeleton'
import { useI18n } from '../hooks/useI18n'
import { useStore } from '../store/store'
import { translate, type StringKey } from '../i18n/strings'
import { cn } from '../lib/utils'
import { ADMIN_HOME_ROUTE } from '../components/ProtectedRoute'
import { isMissingServiceError } from '../services/service.service'
import type { Service, ServiceDraft, ServicePatch } from '../types/service.types'

/** Which modal, if any, is open. `null` means the plain list. */
type Dialog =
  | { kind: 'create' }
  | { kind: 'edit'; service: Service }
  | { kind: 'deactivate'; service: Service }
  | null

/**
 * Screen 6 — Admin Services (PRD F6-F8). Sits behind ProtectedRoute, and every
 * call it makes goes through api-gateway, which is the side that actually
 * decides whether the Admin may write.
 *
 * The store owns the list and every mutation; this page owns only which dialog
 * is open. After a successful write the store already holds the server's
 * record, so nothing here re-sets it — a page that patched the list itself
 * would be showing what it hoped happened rather than what did.
 *
 * A 404 is the one write failure treated as its own case: the record was
 * removed between this list loading and the write being sent, so the list is
 * reloaded rather than the Admin being invited to retry something that can
 * never succeed (.rule/error-handling-rules.md).
 */
export function AdminServicesPage() {
  const { t } = useI18n()

  const services = useStore((state) => state.adminServices)
  const isLoading = useStore((state) => state.isLoadingAdminServices)
  const hasError = useStore((state) => state.hasAdminServicesError)
  const isSaving = useStore((state) => state.isSavingService)
  const loadAdminServices = useStore((state) => state.loadAdminServices)
  const createService = useStore((state) => state.createService)
  const updateService = useStore((state) => state.updateService)
  const deactivateService = useStore((state) => state.deactivateService)

  const [dialog, setDialog] = useState<Dialog>(null)

  const handleLoad = useCallback(async () => {
    try {
      await loadAdminServices()
    } catch {
      // The locale is read at failure time rather than closed over, so this
      // callback stays stable and switching language never refires the fetch.
      toast.error(translate(useStore.getState().locale, 'adminServices.error.toast'))
    }
  }, [loadAdminServices])

  useEffect(() => {
    void handleLoad()
  }, [handleLoad])

  /** Maps a failed write to the one message it deserves, and reloads on a 404. */
  const reportWriteFailure = useCallback(
    (error: unknown, fallbackKey: StringKey) => {
      const locale = useStore.getState().locale

      if (isMissingServiceError(error)) {
        toast.error(translate(locale, 'adminServices.missing.toast'))
        void handleLoad()
        return
      }

      toast.error(translate(locale, fallbackKey))
    },
    [handleLoad],
  )

  const handleCreate = async (draft: ServiceDraft) => {
    try {
      await createService(draft)
      setDialog(null)
      toast.success(translate(useStore.getState().locale, 'adminServices.create.toast'))
    } catch (err) {
      // The dialog stays open on failure: closing it would throw away what the
      // Admin typed for a request that never landed.
      reportWriteFailure(err, 'adminServices.create.errorToast')
    }
  }

  const handleUpdate = async (id: string, patch: ServicePatch) => {
    try {
      await updateService(id, patch)
      setDialog(null)
      toast.success(translate(useStore.getState().locale, 'adminServices.update.toast'))
    } catch (err) {
      reportWriteFailure(err, 'adminServices.update.errorToast')
    }
  }

  const handleDeactivate = async (service: Service) => {
    try {
      await deactivateService(service.id)
      setDialog(null)
      toast.success(
        translate(useStore.getState().locale, 'adminServices.deactivate.toast', {
          name: service.name,
        }),
      )
    } catch (err) {
      reportWriteFailure(err, 'adminServices.deactivate.errorToast')
    }
  }

  const closeDialog = () => {
    if (isSaving) return
    setDialog(null)
  }

  return (
    <main id="main-content" className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 md:mb-8">
        <PageHeader title={t('adminServices.title')} subtitle={t('adminServices.subtitle')} />

        <button
          type="button"
          onClick={() => setDialog({ kind: 'create' })}
          disabled={isSaving}
          className={cn(
            'inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3',
            'text-sm font-semibold text-white transition-colors hover:bg-primary/90',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            isSaving && 'cursor-not-allowed opacity-60 hover:bg-primary',
          )}
        >
          <Plus className="size-4 shrink-0" aria-hidden="true" />
          {t('adminServices.create')}
        </button>
      </div>

      {/* One live region around every outcome, so a screen reader hears the list
          arriving, the empty message, or the failure without re-navigating. */}
      <section aria-live="polite" aria-busy={isLoading}>
        {isLoading ? (
          <>
            <span className="sr-only">{t('adminServices.loading')}</span>
            <ServiceListSkeleton />
          </>
        ) : hasError ? (
          <StateMessage
            icon={AlertTriangle}
            tone="danger"
            title={t('adminServices.error.title')}
            body={t('adminServices.error.body')}
            actionLabel={t('common.retry')}
            onAction={() => void handleLoad()}
          />
        ) : services.length === 0 ? (
          <StateMessage
            icon={PawPrint}
            title={t('adminServices.empty.title')}
            body={t('adminServices.empty.body')}
            actionLabel={t('adminServices.empty.action')}
            onAction={() => setDialog({ kind: 'create' })}
          />
        ) : (
          <AdminServiceTable
            services={services}
            isBusy={isSaving}
            onEdit={(service) => setDialog({ kind: 'edit', service })}
            onDeactivate={(service) => setDialog({ kind: 'deactivate', service })}
          />
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
        {t('adminServices.back')}
      </Link>

      {(dialog?.kind === 'create' || dialog?.kind === 'edit') && (
        // Keyed by the record being edited so re-opening the form on another
        // row starts from that row's values rather than the previous one's.
        <ServiceForm
          key={dialog.kind === 'edit' ? dialog.service.id : 'create'}
          isOpen
          service={dialog.kind === 'edit' ? dialog.service : null}
          isSubmitting={isSaving}
          onClose={closeDialog}
          onCreate={(draft) => void handleCreate(draft)}
          onUpdate={(id, patch) => void handleUpdate(id, patch)}
        />
      )}

      {dialog?.kind === 'deactivate' && (
        <DeactivateServiceDialog
          service={dialog.service}
          isSubmitting={isSaving}
          onCancel={closeDialog}
          onConfirm={() => void handleDeactivate(dialog.service)}
        />
      )}
    </main>
  )
}
