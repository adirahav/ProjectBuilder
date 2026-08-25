import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Bus, CheckCircle2, Eye, EyeOff, Info, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { TextField } from '../components/form/TextField'
import { cn } from '../lib/utils'
import { authService } from '../services/auth.service'
import { ApiError, ConflictError, NetworkError } from '../services/http.service'
import type { SignupFieldErrors, SignupPayload } from '../types/auth.types'
import {
  hasFieldErrors,
  validateEmail,
  validateFullName,
  validatePassword,
  validateSignup,
} from '../utils/auth.utils'

/**
 * Screen 2 — Admin Signup. A standalone page (not a modal), reusing the
 * gateway's card + form-field pattern (docs/design/design-notes.md §1: Screen 2
 * is deliberately not mocked because it introduces no new visual vocabulary).
 *
 * Signup never grants admin permissions — the account is always created with
 * `roles: ["user"]` (PRD F2b / AC-2). Both the pre-submit notice and the success
 * state say so explicitly, and there is no admin-dashboard redirect.
 */

const EMPTY_FORM: SignupPayload = { fullName: '', email: '', password: '' }

export function SignupPage() {
  const [values, setValues] = useState<SignupPayload>(EMPTY_FORM)
  const [errors, setErrors] = useState<SignupFieldErrors>({})
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  function setField(field: keyof SignupPayload, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }))
    // Clear the field's error as soon as the user starts correcting it.
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev))
  }

  function setFieldError(field: keyof SignupPayload, error: string | undefined) {
    setErrors((prev) => ({ ...prev, [field]: error }))
  }

  async function handleSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    if (isSubmitting) return

    // Client-side validation runs first and short-circuits with inline errors —
    // never a toast (.rule/error-handling-rules.md).
    const fieldErrors = validateSignup(values)
    setErrors(fieldErrors)
    if (hasFieldErrors(fieldErrors)) return

    setIsSubmitting(true)
    try {
      await authService.signup(values)
      setValues(EMPTY_FORM)
      setIsSuccess(true)
      toast.success('החשבון נוצר בהצלחה')
    } catch (err) {
      if (err instanceof ConflictError) {
        // Duplicate email: shown inline on the field, no page navigation.
        setFieldError('email', 'כתובת האימייל כבר רשומה במערכת')
        toast.error('כתובת האימייל כבר רשומה במערכת')
      } else if (err instanceof NetworkError) {
        toast.error('אין חיבור לשרת. נסו שוב בעוד רגע')
      } else if (err instanceof ApiError && err.status === 400) {
        toast.error('חלק מהפרטים אינם תקינים. בדקו ונסו שוב')
      } else {
        toast.error('יצירת החשבון נכשלה. נסו שוב')
      }
      console.log('[SIGNUP] signup failed', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-xl bg-accent-500 text-n-0 shadow-md">
          <Bus aria-hidden="true" className="size-7" />
        </span>
        <h1 className="text-display text-primary-900">הילה טיולים</h1>
        <p className="mt-2 text-body text-n-500">ניהול מושבים באוטובוסי טיולים — בזמן אמת</p>
      </div>

      <div className="w-full max-w-[420px] rounded-xl border border-n-100 bg-n-0 p-6 shadow-sm">
        {isSuccess ? (
          <SignupSuccess />
        ) : (
          <>
            <h2 className="text-h2 text-primary-900">יצירת חשבון</h2>
            <p className="mt-2 text-label text-n-500">
              מלאו את הפרטים כדי לפתוח חשבון חדש במערכת.
            </p>

            <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
              <TextField
                id="full-name"
                label="שם מלא"
                value={values.fullName}
                onChange={(value) => setField('fullName', value)}
                onBlur={() => setFieldError('fullName', validateFullName(values.fullName))}
                autoComplete="name"
                error={errors.fullName}
                disabled={isSubmitting}
              />

              <TextField
                id="email"
                label="אימייל"
                type="email"
                value={values.email}
                onChange={(value) => setField('email', value)}
                onBlur={() => setFieldError('email', validateEmail(values.email))}
                autoComplete="email"
                isNumeral
                error={errors.email}
                disabled={isSubmitting}
              />

              <TextField
                id="password"
                label="סיסמה"
                type={isPasswordVisible ? 'text' : 'password'}
                value={values.password}
                onChange={(value) => setField('password', value)}
                onBlur={() => setFieldError('password', validatePassword(values.password))}
                autoComplete="new-password"
                isNumeral
                hint="לפחות 8 תווים, הכוללים אות אחת וספרה אחת."
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

              <p className="flex items-start gap-2 rounded-lg bg-info-50 p-3 text-caption text-n-700">
                <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-info-600" />
                <span>
                  חשבון חדש נוצר תמיד עם הרשאת <span className="numeral">user</span> בלבד. הרשאות
                  ניהול מוענקות על ידי מנהל קיים.
                </span>
              </p>

              <button
                type="submit"
                disabled={isSubmitting}
                className={cn(
                  'mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg',
                  'bg-accent-500 text-label font-semibold text-n-0 transition hover:brightness-95',
                  isSubmitting && 'cursor-not-allowed opacity-45',
                )}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    יוצר חשבון…
                  </>
                ) : (
                  'הרשמה'
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-label text-n-500">
              כבר יש לכם חשבון?
              <Link
                to="/"
                className="ms-1 font-medium text-primary-700 underline underline-offset-2 hover:text-primary-900"
              >
                חזרה למסך הכניסה
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  )
}

/**
 * Neutral success state. Deliberately contains no admin-implying language and
 * no redirect to an admin area (PRD AC-2).
 */
function SignupSuccess() {
  return (
    <div role="status" className="flex flex-col items-center gap-4 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-success-50 text-success-600">
        <CheckCircle2 aria-hidden="true" className="size-6" />
      </span>
      <h2 className="text-h2 text-primary-900">החשבון נוצר בהצלחה</h2>
      <p className="text-body text-n-500">
        החשבון שלכם נפתח עם הרשאת <span className="numeral">user</span> בלבד. כדי לקבל הרשאות ניהול,
        פנו למנהל קיים שיעדכן את ההרשאות עבורכם.
      </p>
      <Link
        to="/"
        className="mt-2 flex h-10 w-full items-center justify-center rounded-lg border border-n-200 bg-n-0 text-label font-medium text-n-700 transition hover:bg-n-50"
      >
        חזרה למסך הכניסה
      </Link>
    </div>
  )
}
