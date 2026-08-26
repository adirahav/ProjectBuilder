import { AlertCircle, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'

/**
 * Stacked label + 40px native select + inline error — the `TextField` pattern
 * from docs/design/design-notes.md §Component conventions, for the tour, bus and
 * `pickupPoint` pickers.
 *
 * A native `<select>` is deliberate rather than a custom listbox: it comes with
 * correct keyboard semantics, screen-reader announcement and a platform picker
 * on the Android/Capacitor build for free — none of which a div-based control
 * would match without re-implementing it.
 *
 * Accessibility: real `<label for>`, error wired through `aria-describedby` +
 * `aria-invalid` and announced via `role="alert"`, errors as inline red text —
 * never a toast (.rule/error-handling-rules.md).
 */
export type SelectOption = {
  value: string
  label: string
}

type SelectFieldProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  options: SelectOption[]
  /** Shown as a disabled first option while nothing is selected. */
  placeholder?: string
  error?: string
  hint?: string
  disabled?: boolean
}

export function SelectField({
  id,
  label,
  value,
  onChange,
  onBlur,
  options,
  placeholder,
  error,
  hint,
  disabled = false,
}: SelectFieldProps) {
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = cn(error && errorId, hint && hintId) || undefined

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-label font-medium text-n-700">
        {label}
      </label>

      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(ev) => onChange(ev.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'h-10 w-full appearance-none rounded-lg border bg-n-0 ps-3 pe-9',
            'text-body text-start text-n-900 focus:border-primary-500',
            'disabled:cursor-not-allowed disabled:opacity-45',
            error ? 'border-danger-600' : 'border-n-200',
          )}
        >
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 end-3 my-auto size-4 text-n-400"
        />
      </div>

      {hint ? (
        <p id={hintId} className="mt-1 text-caption text-n-400">
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
