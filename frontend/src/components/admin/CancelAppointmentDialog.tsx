import { Loader2, X } from 'lucide-react'

import { ModalDialog } from '../common/ModalDialog'
import { useI18n } from '../../hooks/useI18n'
import { cn } from '../../lib/utils'
import type { AdminAppointment } from '../../types/appointment.types'

interface CancelAppointmentDialogProps {
  appointment: AdminAppointment
  isSubmitting: boolean
  onCancel: () => void
  onConfirm: (id: string) => void
}

/**
 * The confirmation step in front of cancelling a booking (PRD F11).
 *
 * Cancel gets this step and confirm does not, for a plain reason: confirming is
 * low-risk and undone by cancelling, whereas cancelling reaches a customer who
 * is expecting to turn up and hands their time straight back to the public
 * booking screen, where anyone may take it within seconds. There is no
 * un-cancel, and the copy says so rather than implying a way back that this
 * screen does not have (plan 013, Open Question 4).
 *
 * "Keep the appointment" is the first control in the dialog, so the default
 * keyboard action of someone who opened it by mistake is the harmless one.
 */
export function CancelAppointmentDialog({
  appointment,
  isSubmitting,
  onCancel,
  onConfirm,
}: CancelAppointmentDialogProps) {
  const { t } = useI18n()

  return (
    <ModalDialog
      isOpen
      title={t('adminAppointments.cancelDialog.title', { name: appointment.customerName })}
      description={t('adminAppointments.cancelDialog.body')}
      closeLabel={t('adminAppointments.cancelDialog.close')}
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
          {t('adminAppointments.cancelDialog.keep')}
        </button>

        <button
          type="button"
          onClick={() => onConfirm(appointment.id)}
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
            <X className="size-4 shrink-0" aria-hidden="true" />
          )}
          {isSubmitting
            ? t('adminAppointments.cancelDialog.submitting')
            : t('adminAppointments.cancelDialog.submit')}
        </button>
      </div>
    </ModalDialog>
  )
}
