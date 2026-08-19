import { useState, type FormEvent } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'

import { FormField } from '../common/FormField'
import { useI18n } from '../../hooks/useI18n'
import { cn } from '../../lib/utils'
import {
  validateCustomerDetails,
  validateCustomerField,
  type CustomerDetailsErrors,
  type CustomerField,
} from '../../utils/customer.utils'
import type { CustomerDetails } from '../../types/appointment.types'

const EMPTY_DETAILS: CustomerDetails = {
  customerName: '',
  customerPhone: '',
  customerEmail: '',
}

interface CustomerDetailsFormProps {
  /** True while the create request is in flight. */
  isSubmitting: boolean
  /** True once the hold is gone — booking these details would be pointless. */
  isDisabled: boolean
  onSubmit: (details: CustomerDetails) => void
}

/**
 * The contact form itself (PRD F4: name and phone required, email optional).
 * Presentational plus its own local field state — the page owns the request and
 * everything that follows it.
 *
 * Validation runs on blur and again on submit, never on every keystroke: an
 * error that appears while someone is still halfway through typing their phone
 * number is telling them they got it wrong before they were finished.
 *
 * Every error renders inline beneath its field, never as a toast — a toast is
 * reserved for outcomes that needed the server to know
 * (.rule/error-handling-rules.md).
 */
export function CustomerDetailsForm({
  isSubmitting,
  isDisabled,
  onSubmit,
}: CustomerDetailsFormProps) {
  const { t } = useI18n()

  const [details, setDetails] = useState<CustomerDetails>(EMPTY_DETAILS)
  const [errors, setErrors] = useState<CustomerDetailsErrors>({})
  const [hasFailedSubmit, setHasFailedSubmit] = useState(false)

  const setField = (field: CustomerField) => (value: string) => {
    setDetails((current) => ({ ...current, [field]: value }))

    // Clear an existing error as soon as the Customer starts fixing it, rather
    // than making them submit again to find out whether they have.
    setErrors((current) => {
      if (!current[field]) return current

      const next = { ...current }
      delete next[field]
      return next
    })
  }

  const checkField = (field: CustomerField) => () => {
    setErrors((current) => {
      const error = validateCustomerField(field, details)
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
    if (isSubmitting || isDisabled) return

    const nextErrors = validateCustomerDetails(details)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      // A submit that silently does nothing looks broken, so the blocked
      // attempt is announced as well as marked field by field.
      setHasFailedSubmit(true)
      return
    }

    setHasFailedSubmit(false)
    onSubmit(details)
  }

  const errorFor = (field: CustomerField) => {
    const key = errors[field]
    return key ? t(key) : undefined
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <fieldset disabled={isSubmitting || isDisabled} className="flex flex-col gap-5">
        <legend className="sr-only">{t('details.form.legend')}</legend>

        {hasFailedSubmit && Object.keys(errors).length > 0 && (
          <p
            role="alert"
            className={cn(
              'flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10',
              'px-4 py-3 text-sm font-medium text-danger',
            )}
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t('details.form.summary')}
          </p>
        )}

        <FormField
          label={t('details.form.name.label')}
          placeholder={t('details.form.name.placeholder')}
          value={details.customerName}
          onChange={setField('customerName')}
          onBlur={checkField('customerName')}
          error={errorFor('customerName')}
          autoComplete="name"
          isRequired
        />

        <FormField
          label={t('details.form.phone.label')}
          placeholder={t('details.form.phone.placeholder')}
          hint={t('details.form.phone.hint')}
          value={details.customerPhone}
          onChange={setField('customerPhone')}
          onBlur={checkField('customerPhone')}
          error={errorFor('customerPhone')}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          isRequired
        />

        <FormField
          label={t('details.form.email.label')}
          placeholder={t('details.form.email.placeholder')}
          hint={t('details.form.email.hint')}
          value={details.customerEmail}
          onChange={setField('customerEmail')}
          onBlur={checkField('customerEmail')}
          error={errorFor('customerEmail')}
          type="email"
          inputMode="email"
          autoComplete="email"
          dir="ltr"
        />
      </fieldset>

      <button
        type="submit"
        disabled={isSubmitting || isDisabled}
        aria-busy={isSubmitting}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5',
          'text-base font-semibold text-white transition-colors hover:bg-primary/90',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          (isSubmitting || isDisabled) && 'cursor-not-allowed opacity-60 hover:bg-primary',
        )}
      >
        {isSubmitting && <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden="true" />}
        {isSubmitting ? t('details.submitting') : t('details.submit')}
      </button>
    </form>
  )
}
