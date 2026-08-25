import { AlertCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/**
 * Stacked label + 40px input + inline error, per the form-field convention in
 * docs/design/design-notes.md §Component conventions.
 *
 * Accessibility: the label is always a real `<label for>`, the error is wired
 * through `aria-describedby` + `aria-invalid` and announced via `role="alert"`.
 * Errors render as red inline text — never a toast
 * (.rule/error-handling-rules.md).
 */
type TextFieldProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  type?: 'text' | 'email' | 'password'
  autoComplete?: string
  placeholder?: string
  error?: string
  hint?: string
  disabled?: boolean
  /** Renders LTR-isolated content (emails, passwords) inside the RTL layout. */
  isNumeral?: boolean
  /** Control rendered inside the inline-end edge of the input (e.g. show/hide). */
  endSlot?: ReactNode
}

export function TextField({
  id,
  label,
  value,
  onChange,
  onBlur,
  type = 'text',
  autoComplete,
  placeholder,
  error,
  hint,
  disabled = false,
  isNumeral = false,
  endSlot,
}: TextFieldProps) {
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = cn(error && errorId, hint && hintId) || undefined

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-label font-medium text-n-700">
        {label}
      </label>

      <div className="relative">
        <input
          id={id}
          type={type}
          value={value}
          onChange={(ev) => onChange(ev.target.value)}
          onBlur={onBlur}
          autoComplete={autoComplete}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'h-10 w-full rounded-lg border bg-n-0 px-3 text-body text-start text-n-900',
            'placeholder:text-n-400 focus:border-primary-500',
            'disabled:cursor-not-allowed disabled:opacity-45',
            isNumeral && 'numeral',
            endSlot && 'pe-20',
            error ? 'border-danger-600' : 'border-n-200',
          )}
        />
        {endSlot ? (
          <span className="absolute inset-y-0 end-2 my-auto flex h-7 items-center">{endSlot}</span>
        ) : null}
      </div>

      {hint ? (
        <p id={hintId} className="mt-1 text-caption text-n-500">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p
          id={errorId}
          role="alert"
          className="mt-1 flex items-center gap-1 text-caption font-medium text-danger-600"
        >
          <AlertCircle aria-hidden="true" className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  )
}
