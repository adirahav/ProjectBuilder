import { EyeOff, Loader2 } from 'lucide-react'

import { ModalDialog } from '../common/ModalDialog'
import { useI18n } from '../../hooks/useI18n'
import { cn } from '../../lib/utils'
import type { Service } from '../../types/service.types'

interface DeactivateServiceDialogProps {
  service: Service
  isSubmitting: boolean
  onCancel: () => void
  onConfirm: (id: string) => void
}

/**
 * The confirmation step in front of a deactivation (PRD F8).
 *
 * It is a soft delete, and the copy says so — the record survives, existing
 * appointments are untouched, and the edit form can offer the treatment again.
 * Confirming an action that feels irreversible is worth one extra press; making
 * it *sound* irreversible when it is not would be a lie that costs the Admin a
 * support call.
 *
 * Cancel is the first control in the dialog, so the default keyboard action of
 * someone who opened it by mistake is the harmless one.
 */
export function DeactivateServiceDialog({
  service,
  isSubmitting,
  onCancel,
  onConfirm,
}: DeactivateServiceDialogProps) {
  const { t } = useI18n()

  return (
    <ModalDialog
      isOpen
      title={t('adminServices.confirm.title', { name: service.name })}
      description={t('adminServices.confirm.body')}
      closeLabel={t('adminServices.confirm.close')}
      onClose={onCancel}
      isDismissDisabled={isSubmitting}
    >
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className={cn(
            'inline-flex items-center justify-center rounded-xl border border-neutral-900/15 px-5 py-3',
            'text-sm font-semibold text-neutral-900 transition-colors hover:bg-primary-light',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            isSubmitting && 'cursor-not-allowed opacity-60',
          )}
        >
          {t('adminServices.confirm.cancel')}
        </button>

        <button
          type="button"
          onClick={() => onConfirm(service.id)}
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          className={cn(
            'inline-flex items-center justify-center gap-2 rounded-xl bg-danger px-6 py-3',
            'text-sm font-semibold text-white transition-colors hover:bg-danger/90',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2',
            isSubmitting && 'cursor-not-allowed opacity-60 hover:bg-danger',
          )}
        >
          {isSubmitting ? (
            <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
          ) : (
            <EyeOff className="size-4 shrink-0" aria-hidden="true" />
          )}
          {isSubmitting ? t('adminServices.confirm.submitting') : t('adminServices.confirm.submit')}
        </button>
      </div>
    </ModalDialog>
  )
}
