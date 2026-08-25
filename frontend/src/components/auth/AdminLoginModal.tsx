import { useState, type FormEvent } from 'react'
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '../Modal'
import { TextField } from '../form/TextField'
import { cn } from '../../lib/utils'
import { authService } from '../../services/auth.service'
import { ApiError, NetworkError } from '../../services/http.service'
import type { LoginFieldErrors, LoginPayload } from '../../types/auth.types'
import { hasFieldErrors, validateEmail, validateLogin } from '../../utils/auth.utils'

/**
 * Screen 1's admin login modal (PRD F1, plan 006 Step 4).
 *
 * Failure behaviour is the point of this component: an invalid credential
 * response leaves the modal open, the fields editable, and shows one generic
 * inline message — it never navigates, never closes, and never distinguishes
 * "unknown email" from "wrong password" from "account is not an admin", since
 * doing so would leak which accounts exist (plan 006, Risks).
 *
 * The submitted password lives only in local state for the lifetime of the
 * modal, is cleared on success, and is never logged.
 */

const EMPTY_FORM: LoginPayload = { email: '', password: '' }

/** One message for every credential-failure mode — deliberately undifferentiated. */
const INVALID_CREDENTIALS_MESSAGE = 'כתובת האימייל או הסיסמה שגויים'

type AdminLoginModalProps = {
  isOpen: boolean
  onClose: () => void
  /** Called after the session is established, so the page can redirect. */
  onSuccess: () => void
}

export function AdminLoginModal({ isOpen, onClose, onSuccess }: AdminLoginModalProps) {
  const [values, setValues] = useState<LoginPayload>(EMPTY_FORM)
  const [errors, setErrors] = useState<LoginFieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function resetAndClose() {
    setValues(EMPTY_FORM)
    setErrors({})
    setFormError(null)
    setIsPasswordVisible(false)
    onClose()
  }

  function setField(field: keyof LoginPayload, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }))
    // Editing clears both the field error and the previous server rejection, so
    // a stale "wrong credentials" never sits under a freshly corrected form.
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev))
    setFormError(null)
  }

  async function handleSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    if (isSubmitting) return

    // Client-side validation short-circuits with inline field errors — never a
    // toast (.rule/error-handling-rules.md).
    const fieldErrors = validateLogin(values)
    setErrors(fieldErrors)
    setFormError(null)
    if (hasFieldErrors(fieldErrors)) return

    setIsSubmitting(true)
    try {
      await authService.login(values)
      // The service already persisted the token and set the session — the
      // component must not duplicate that (.rule/coding-rules.md).
      setValues(EMPTY_FORM)
      toast.success('התחברת בהצלחה')
      onSuccess()
    } catch (err) {
      if (err instanceof NetworkError) {
        setFormError('אין חיבור לשרת. נסו שוב בעוד רגע')
        toast.error('אין חיבור לשרת. נסו שוב בעוד רגע')
      } else if (err instanceof ApiError && (err.status === 401 || err.status === 400)) {
        // Credential failure: inline only. A toast would duplicate a message the
        // user is already looking at inside an open modal.
        setFormError(INVALID_CREDENTIALS_MESSAGE)
      } else {
        setFormError('ההתחברות נכשלה. נסו שוב')
        toast.error('ההתחברות נכשלה. נסו שוב')
      }
      // Never log the submitted credentials — status only.
      console.log(
        '[AUTH] admin login failed',
        err instanceof ApiError ? err.status : (err as Error)?.name,
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={resetAndClose}
      title="כניסת מנהל"
      description="הזינו את פרטי המנהל שלכם"
      closeLabel="סגירת חלון ההתחברות"
    >
      <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        <TextField
          id="login-email"
          label="אימייל"
          type="email"
          value={values.email}
          onChange={(value) => setField('email', value)}
          onBlur={() => setErrors((prev) => ({ ...prev, email: validateEmail(values.email) }))}
          autoComplete="username"
          isNumeral
          error={errors.email}
          disabled={isSubmitting}
        />

        <TextField
          id="login-password"
          label="סיסמה"
          type={isPasswordVisible ? 'text' : 'password'}
          value={values.password}
          onChange={(value) => setField('password', value)}
          autoComplete="current-password"
          isNumeral
          error={errors.password}
          disabled={isSubmitting}
          endSlot={
            <button
              type="button"
              onClick={() => setIsPasswordVisible((prev) => !prev)}
              aria-pressed={isPasswordVisible}
              aria-label={isPasswordVisible ? 'הסתרת הסיסמה' : 'הצגת הסיסמה'}
              className="flex h-7 items-center gap-1 rounded-lg px-2 text-caption font-medium text-primary-700 transition hover:bg-primary-100"
            >
              {isPasswordVisible ? (
                <EyeOff aria-hidden="true" className="size-3.5" />
              ) : (
                <Eye aria-hidden="true" className="size-3.5" />
              )}
              {isPasswordVisible ? 'הסתר' : 'הצג'}
            </button>
          }
        />

        {/*
          Form-level server rejection. `aria-live` (not just role="alert") so the
          message is announced even when it replaces an identical previous one
          after a second failed attempt.
        */}
        <p aria-live="assertive" className="min-h-0">
          {formError ? (
            <span className="flex items-start gap-2 rounded-lg bg-danger-50 p-3 text-caption font-medium text-danger-600">
              <AlertCircle aria-hidden="true" className="mt-px size-4 shrink-0" />
              {formError}
            </span>
          ) : null}
        </p>

        <div className="mt-2 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={resetAndClose}
            disabled={isSubmitting}
            className={cn(
              'rounded-lg px-4 py-2 text-label font-medium text-primary-700 transition hover:bg-primary-100',
              isSubmitting && 'cursor-not-allowed opacity-45',
            )}
          >
            ביטול
          </button>

          <button
            type="submit"
            disabled={isSubmitting}
            className={cn(
              'flex h-10 items-center justify-center gap-2 rounded-lg bg-primary-700 px-4',
              'text-label font-medium text-n-0 transition hover:bg-primary-900',
              isSubmitting && 'cursor-not-allowed opacity-45 hover:bg-primary-700',
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                מתחבר…
              </>
            ) : (
              'התחברות'
            )}
          </button>
        </div>
      </form>
    </Modal>
  )
}
