import { useState, type FormEvent } from 'react'
import { AlertTriangle, LogIn, Loader2 } from 'lucide-react'

import { FormField } from '../common/FormField'
import { useI18n } from '../../hooks/useI18n'
import { cn } from '../../lib/utils'
import {
  validateCredentialField,
  validateCredentials,
  type AdminCredentialsErrors,
  type CredentialField,
} from '../../utils/auth.utils'
import type { AdminCredentials } from '../../types/auth.types'

const EMPTY_CREDENTIALS: AdminCredentials = {
  identifier: '',
  password: '',
}

interface AdminLoginFormProps {
  /** True while the login request is in flight. */
  isSubmitting: boolean
  onSubmit: (credentials: AdminCredentials) => void
}

/**
 * The Admin credentials form (PRD F5). Presentational plus its own local field
 * state — the page owns the request, the token and everything that follows.
 *
 * The password never leaves this component except through `onSubmit`: it is not
 * lifted into the store, not logged, and not echoed back into any message.
 *
 * Validation runs on blur and again on submit, never on every keystroke, and
 * every error renders inline beneath its field rather than as a toast — a toast
 * is reserved for outcomes that needed the server to know
 * (.rule/error-handling-rules.md).
 */
export function AdminLoginForm({ isSubmitting, onSubmit }: AdminLoginFormProps) {
  const { t } = useI18n()

  const [credentials, setCredentials] = useState<AdminCredentials>(EMPTY_CREDENTIALS)
  const [errors, setErrors] = useState<AdminCredentialsErrors>({})
  const [hasFailedSubmit, setHasFailedSubmit] = useState(false)

  const setField = (field: CredentialField) => (value: string) => {
    setCredentials((current) => ({ ...current, [field]: value }))

    // Clear an existing error as soon as the Admin starts fixing it, rather
    // than making them submit again to find out whether they have.
    setErrors((current) => {
      if (!current[field]) return current

      const next = { ...current }
      delete next[field]
      return next
    })
  }

  const checkField = (field: CredentialField) => () => {
    setErrors((current) => {
      const error = validateCredentialField(field, credentials)
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

    const nextErrors = validateCredentials(credentials)
    setErrors(nextErrors)

    if (Object.keys(nextErrors).length > 0) {
      // A submit that silently does nothing looks broken, so the blocked
      // attempt is announced as well as marked field by field.
      setHasFailedSubmit(true)
      return
    }

    setHasFailedSubmit(false)
    onSubmit(credentials)
  }

  const errorFor = (field: CredentialField) => {
    const key = errors[field]
    return key ? t(key) : undefined
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <fieldset disabled={isSubmitting} className="flex flex-col gap-5">
        <legend className="sr-only">{t('adminLogin.form.legend')}</legend>

        {hasFailedSubmit && Object.keys(errors).length > 0 && (
          <p
            role="alert"
            className={cn(
              'flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10',
              'px-4 py-3 text-sm font-medium text-danger',
            )}
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t('adminLogin.form.summary')}
          </p>
        )}

        <FormField
          label={t('adminLogin.form.identifier.label')}
          placeholder={t('adminLogin.form.identifier.placeholder')}
          value={credentials.identifier}
          onChange={setField('identifier')}
          onBlur={checkField('identifier')}
          error={errorFor('identifier')}
          autoComplete="username"
          // An address or a username reads as LTR even on a Hebrew page.
          dir="ltr"
          isRequired
        />

        <FormField
          label={t('adminLogin.form.password.label')}
          value={credentials.password}
          onChange={setField('password')}
          onBlur={checkField('password')}
          error={errorFor('password')}
          type="password"
          autoComplete="current-password"
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
          <LogIn className="size-5 shrink-0 rtl:-scale-x-100" aria-hidden="true" />
        )}
        {isSubmitting ? t('adminLogin.submitting') : t('adminLogin.submit')}
      </button>
    </form>
  )
}
