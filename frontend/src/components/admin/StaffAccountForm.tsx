import { useState, type FormEvent } from 'react'
import { AlertTriangle, Loader2, UserPlus } from 'lucide-react'

import { FormField } from '../common/FormField'
import { useI18n } from '../../hooks/useI18n'
import { cn } from '../../lib/utils'
import {
  validateStaffAccount,
  validateStaffAccountField,
  type StaffAccountErrors,
  type StaffAccountField,
} from '../../utils/staffAccount.utils'
import type { StaffAccountDraft } from '../../types/auth.types'

const EMPTY_DRAFT: StaffAccountDraft = {
  name: '',
  email: '',
  password: '',
}

interface StaffAccountFormProps {
  /** True while the create request is in flight. */
  isSubmitting: boolean
  onSubmit: (draft: StaffAccountDraft) => void
}

/**
 * The new-staff-account form (PRD F12, Screen 8). Presentational plus its own
 * local field state — the page owns the request and everything that follows.
 *
 * The password never leaves this component except through `onSubmit`: it is not
 * lifted into the store, not logged, and not echoed back into any message, for
 * exactly the same reasons AdminLoginForm keeps its own password local. Note
 * `autoComplete="new-password"` rather than `current-password` — this form is
 * setting someone else's credential, and a browser that helpfully filled in the
 * signed-in Admin's own saved password here would create an account whose
 * password its owner does not know.
 *
 * Validation runs on blur and again on submit, never on every keystroke, and
 * every error renders inline beneath its field rather than as a toast — a toast
 * is reserved for outcomes that needed the server to know
 * (.rule/error-handling-rules.md).
 */
export function StaffAccountForm({ isSubmitting, onSubmit }: StaffAccountFormProps) {
  const { t } = useI18n()

  const [draft, setDraft] = useState<StaffAccountDraft>(EMPTY_DRAFT)
  const [errors, setErrors] = useState<StaffAccountErrors>({})
  const [hasFailedSubmit, setHasFailedSubmit] = useState(false)

  const setField = (field: StaffAccountField) => (value: string) => {
    setDraft((current) => ({ ...current, [field]: value }))

    // Clear an existing error as soon as the Admin starts fixing it, rather
    // than making them submit again to find out whether they have.
    setErrors((current) => {
      if (!current[field]) return current

      const next = { ...current }
      delete next[field]
      return next
    })
  }

  const checkField = (field: StaffAccountField) => () => {
    setErrors((current) => {
      const error = validateStaffAccountField(field, draft)
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

    const nextErrors = validateStaffAccount(draft)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      // A submit that silently does nothing looks broken, so the blocked
      // attempt is announced as well as marked field by field.
      setHasFailedSubmit(true)
      return
    }

    setHasFailedSubmit(false)
    onSubmit(draft)
  }

  const errorFor = (field: StaffAccountField) => {
    const key = errors[field]
    return key ? t(key) : undefined
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <fieldset disabled={isSubmitting} className="flex flex-col gap-5">
        <legend className="sr-only">{t('adminStaff.form.legend')}</legend>

        {hasFailedSubmit && Object.keys(errors).length > 0 && (
          <p
            role="alert"
            className={cn(
              'flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10',
              'px-4 py-3 text-sm font-medium text-danger',
            )}
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t('adminStaff.form.summary')}
          </p>
        )}

        <FormField
          label={t('adminStaff.form.name.label')}
          placeholder={t('adminStaff.form.name.placeholder')}
          hint={t('adminStaff.form.name.hint')}
          value={draft.name}
          onChange={setField('name')}
          onBlur={checkField('name')}
          error={errorFor('name')}
          autoComplete="name"
          isRequired
        />

        <FormField
          label={t('adminStaff.form.email.label')}
          placeholder={t('adminStaff.form.email.placeholder')}
          hint={t('adminStaff.form.email.hint')}
          value={draft.email}
          onChange={setField('email')}
          onBlur={checkField('email')}
          error={errorFor('email')}
          type="email"
          inputMode="email"
          autoComplete="email"
          // An address reads as LTR even on a Hebrew page.
          dir="ltr"
          isRequired
        />

        <FormField
          label={t('adminStaff.form.password.label')}
          hint={t('adminStaff.form.password.hint')}
          value={draft.password}
          onChange={setField('password')}
          onBlur={checkField('password')}
          error={errorFor('password')}
          type="password"
          autoComplete="new-password"
          dir="ltr"
          isRequired
        />
      </fieldset>

      <button
        type="submit"
        disabled={isSubmitting}
        aria-busy={isSubmitting}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5',
          'text-base font-semibold text-white transition-colors hover:bg-primary/90',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          isSubmitting && 'cursor-not-allowed opacity-60 hover:bg-primary',
        )}
      >
        {isSubmitting ? (
          <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden="true" />
        ) : (
          <UserPlus className="size-5 shrink-0" aria-hidden="true" />
        )}
        {isSubmitting ? t('adminStaff.form.submitting') : t('adminStaff.form.submit')}
      </button>
    </form>
  )
}
