import { useState, type FormEvent } from 'react'
import { AlertTriangle, Loader2, Save } from 'lucide-react'

import { FormField } from '../common/FormField'
import { ModalDialog } from '../common/ModalDialog'
import { useI18n } from '../../hooks/useI18n'
import { cn } from '../../lib/utils'
import {
  emptyServiceFormValues,
  isEmptyServicePatch,
  serviceToFormValues,
  toServiceDraft,
  toServicePatch,
  validateServiceField,
  validateServiceForm,
  type ServiceFormErrors,
} from '../../utils/service.utils'
import type {
  Service,
  ServiceDraft,
  ServiceFormField,
  ServiceFormValues,
  ServicePatch,
} from '../../types/service.types'

interface ServiceFormProps {
  isOpen: boolean
  /** The record being edited, or `null` for the create form. */
  service: Service | null
  /** True while the create/edit request is in flight. */
  isSubmitting: boolean
  onClose: () => void
  onCreate: (draft: ServiceDraft) => void
  onUpdate: (id: string, patch: ServicePatch) => void
}

/**
 * The Admin create/edit form (PRD F6/F7), shown as a modal over the list so the
 * Admin never loses sight of what they were working on (plan 012, Open
 * Question 5).
 *
 * One component serves both modes because the fields are identical and the only
 * real difference is the payload: create sends every field, edit sends the
 * changed ones alone, so a field another Admin touched in the meantime is not
 * silently overwritten.
 *
 * The active toggle only appears when editing. On create it would be a
 * contradiction — there is no reason to add a treatment nobody can book — while
 * on edit it is the only route back from a deactivation (plan 012, Open
 * Question 3).
 *
 * Validation runs on blur and again on submit, never per keystroke, and always
 * renders inline beneath its field; a toast here would be wrong, because
 * nothing had to reach the server to know (.rule/error-handling-rules.md).
 */
export function ServiceForm({
  isOpen,
  service,
  isSubmitting,
  onClose,
  onCreate,
  onUpdate,
}: ServiceFormProps) {
  const { t } = useI18n()

  const isEditing = service !== null

  const [values, setValues] = useState<ServiceFormValues>(() =>
    service ? serviceToFormValues(service) : emptyServiceFormValues(),
  )
  const [errors, setErrors] = useState<ServiceFormErrors>({})
  const [hasFailedSubmit, setHasFailedSubmit] = useState(false)

  const setField = (field: ServiceFormField) => (value: string | boolean) => {
    setValues((current) => ({ ...current, [field]: value }))

    setErrors((current) => {
      if (!current[field]) return current

      const next = { ...current }
      delete next[field]
      return next
    })
  }

  const checkField = (field: ServiceFormField) => () => {
    setErrors((current) => {
      const error = validateServiceField(field, values)
      if (!error) {
        if (!current[field]) return current

        const next = { ...current }
        delete next[field]
        return next
      }

      return { ...current, [field]: error }
    })
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) return

    const nextErrors = validateServiceForm(values)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      // A submit that quietly does nothing looks broken, so the blocked attempt
      // is announced as well as marked field by field.
      setHasFailedSubmit(true)
      return
    }

    setHasFailedSubmit(false)

    if (!service) {
      onCreate(toServiceDraft(values))
      return
    }

    const patch = toServicePatch(values, service)
    // Nothing changed: sending an empty PATCH would be a request that cannot
    // accomplish anything, so the form says so instead of firing it.
    if (isEmptyServicePatch(patch)) {
      setHasFailedSubmit(true)
      return
    }

    onUpdate(service.id, patch)
  }

  const errorFor = (field: ServiceFormField) => {
    const key = errors[field]
    return key ? t(key) : undefined
  }

  const hasNoChanges =
    isEditing &&
    Object.keys(errors).length === 0 &&
    isEmptyServicePatch(toServicePatchSafely(values, service))

  return (
    <ModalDialog
      isOpen={isOpen}
      title={
        isEditing
          ? t('adminServices.form.editTitle', { name: service.name })
          : t('adminServices.form.createTitle')
      }
      description={
        isEditing ? t('adminServices.form.editSubtitle') : t('adminServices.form.createSubtitle')
      }
      closeLabel={t('adminServices.form.close')}
      onClose={onClose}
      isDismissDisabled={isSubmitting}
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <fieldset disabled={isSubmitting} className="flex flex-col gap-5">
          <legend className="sr-only">{t('adminServices.form.legend')}</legend>

          {hasFailedSubmit && (
            <p
              role="alert"
              className={cn(
                'flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10',
                'px-4 py-3 text-start text-sm font-medium text-danger',
              )}
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {Object.keys(errors).length > 0
                ? t('adminServices.form.summary')
                : t('adminServices.form.noChanges')}
            </p>
          )}

          <FormField
            label={t('adminServices.form.name.label')}
            placeholder={t('adminServices.form.name.placeholder')}
            value={values.name}
            onChange={setField('name')}
            onBlur={checkField('name')}
            error={errorFor('name')}
            isRequired
          />

          <FormField
            label={t('adminServices.form.duration.label')}
            placeholder={t('adminServices.form.duration.placeholder')}
            hint={t('adminServices.form.duration.hint')}
            value={values.durationMinutes}
            onChange={setField('durationMinutes')}
            onBlur={checkField('durationMinutes')}
            error={errorFor('durationMinutes')}
            // A text input with a numeric keypad rather than type="number":
            // the number input silently discards what it cannot parse, which
            // would make "you typed something odd" impossible to explain.
            inputMode="numeric"
            dir="ltr"
            isRequired
          />

          <FormField
            label={t('adminServices.form.price.label')}
            placeholder={t('adminServices.form.price.placeholder')}
            hint={t('adminServices.form.price.hint')}
            value={values.price}
            onChange={setField('price')}
            onBlur={checkField('price')}
            error={errorFor('price')}
            inputMode="decimal"
            dir="ltr"
            isRequired
          />

          {isEditing && (
            <label className="flex items-start gap-3 rounded-xl border border-neutral-900/15 p-4 text-start">
              <input
                type="checkbox"
                checked={values.isActive}
                onChange={(event) => setField('isActive')(event.target.checked)}
                className={cn(
                  'mt-0.5 size-5 shrink-0 rounded border-neutral-900/30 accent-primary',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                )}
              />
              <span className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-neutral-900">
                  {t('adminServices.form.active.label')}
                </span>
                <span className="text-xs text-neutral-900/60">
                  {t('adminServices.form.active.hint')}
                </span>
              </span>
            </label>
          )}
        </fieldset>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className={cn(
              'inline-flex items-center justify-center rounded-xl border border-neutral-900/15 px-5 py-3',
              'text-sm font-semibold text-neutral-900 transition-colors hover:bg-primary-light',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              isSubmitting && 'cursor-not-allowed opacity-60',
            )}
          >
            {t('adminServices.form.cancel')}
          </button>

          <button
            type="submit"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
            // Announced rather than only greyed out, so a keyboard user hears
            // why pressing Save would achieve nothing.
            aria-disabled={hasNoChanges}
            className={cn(
              'inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3',
              'text-sm font-semibold text-white transition-colors hover:bg-primary/90',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              isSubmitting && 'cursor-not-allowed opacity-60 hover:bg-primary',
            )}
          >
            {isSubmitting ? (
              <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="size-4 shrink-0" aria-hidden="true" />
            )}
            {isSubmitting
              ? t('adminServices.form.submitting')
              : isEditing
                ? t('adminServices.form.editSubmit')
                : t('adminServices.form.createSubmit')}
          </button>
        </div>
      </form>
    </ModalDialog>
  )
}

/**
 * `toServicePatch` assumes valid input, so it is only asked for a diff once the
 * current values parse. While a number field is mid-edit ("" or "12abc") there
 * is nothing meaningful to diff, and the answer that matters — "is Save worth
 * pressing?" — is yes, because something is clearly being changed.
 */
function toServicePatchSafely(values: ServiceFormValues, original: Service): ServicePatch {
  if (Object.keys(validateServiceForm(values)).length > 0) return { name: original.name }
  return toServicePatch(values, original)
}
