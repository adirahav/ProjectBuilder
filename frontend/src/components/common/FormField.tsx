import { useId, useState } from 'react'
import { AlertCircle, Eye, EyeOff } from 'lucide-react'

import { useI18n } from '../../hooks/useI18n'
import { cn } from '../../lib/utils'

interface FormFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  /** Localized error text. Its presence is what puts the field in an error state. */
  error?: string
  /** Persistent helper text, shown whether or not the field is in error. */
  hint?: string
  isRequired?: boolean
  isDisabled?: boolean
  placeholder?: string
  type?: 'text' | 'tel' | 'email' | 'password'
  autoComplete?: string
  inputMode?: 'text' | 'tel' | 'email' | 'numeric' | 'decimal'
  /**
   * Forces the value's direction. Phone numbers and email addresses are always
   * LTR even inside a Hebrew page, or they render with the punctuation flipped
   * to the wrong end.
   */
  dir?: 'ltr' | 'rtl'
}

/**
 * A labelled text input with its hint and error wired to it for assistive
 * technology (accessibility-layer):
 *
 * - the label is a real `<label for>`, so the field is reachable by its name
 *   and tapping the label focuses the input;
 * - hint and error are referenced by `aria-describedby`, so a screen reader
 *   reads them as part of the field rather than as loose text nearby;
 * - `aria-invalid` marks the error state semantically, and the error text is
 *   prefixed with the word "Error" and an icon — the red tint is a third,
 *   redundant signal, never the only one;
 * - required is announced via `aria-required` *and* a visible word, not a bare
 *   asterisk whose meaning has to be guessed.
 *
 * A `password` field additionally gets a reveal toggle, because the alternative
 * — retyping a password blind after every typo — is exactly how people end up
 * locked out. The toggle is a real `<button>` with its own label, so it is
 * reachable and announced rather than being an unlabelled icon.
 */
export function FormField({
  label,
  value,
  onChange,
  onBlur,
  error,
  hint,
  isRequired = false,
  isDisabled = false,
  placeholder,
  type = 'text',
  autoComplete,
  inputMode,
  dir,
}: FormFieldProps) {
  const { t } = useI18n()

  const fieldId = useId()
  const hintId = `${fieldId}-hint`
  const errorId = `${fieldId}-error`

  const describedBy = cn(hint && hintId, error && errorId) || undefined

  const isPassword = type === 'password'
  const [isRevealed, setIsRevealed] = useState(false)
  // Revealing swaps the input type rather than re-rendering a different input,
  // so focus and the caret position survive the toggle.
  const resolvedType = isPassword && isRevealed ? 'text' : type

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="flex flex-wrap items-baseline gap-2 text-start">
        <span className="text-sm font-semibold text-neutral-900">{label}</span>
        <span className="text-xs font-medium text-neutral-900/60">
          {isRequired ? t('details.form.required') : t('details.form.optional')}
        </span>
      </label>

      <div className="relative flex items-center">
        <input
          id={fieldId}
          type={resolvedType}
          dir={dir}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          disabled={isDisabled}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          aria-required={isRequired}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={cn(
            'w-full rounded-xl border bg-white px-4 py-3 text-start text-base text-neutral-900',
            'transition-colors placeholder:text-neutral-900/35',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
            error
              ? 'border-danger focus-visible:ring-danger'
              : 'border-neutral-900/20 focus-visible:ring-primary hover:border-primary/60',
            isDisabled && 'cursor-not-allowed bg-neutral-50 opacity-60',
            // Room for the reveal button, on whichever side the text ends.
            isPassword && 'pe-12',
          )}
        />

        {isPassword && (
          <button
            type="button"
            onClick={() => setIsRevealed((current) => !current)}
            aria-pressed={isRevealed}
            aria-controls={fieldId}
            className={cn(
              'absolute end-1 flex size-10 items-center justify-center rounded-lg',
              'text-neutral-900/60 transition-colors hover:bg-primary-light hover:text-primary',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            )}
          >
            {isRevealed ? (
              <EyeOff className="size-5" aria-hidden="true" />
            ) : (
              <Eye className="size-5" aria-hidden="true" />
            )}
            <span className="sr-only">
              {isRevealed ? t('adminLogin.form.password.hide') : t('adminLogin.form.password.show')}
            </span>
          </button>
        )}
      </div>

      {hint && (
        <p id={hintId} className="text-xs text-neutral-900/60">
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-sm font-medium text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {/* The word carries the meaning; the colour and icon only reinforce it. */}
            <span className="font-semibold">{t('details.form.errorPrefix')}: </span>
            {error}
          </span>
        </p>
      )}
    </div>
  )
}
