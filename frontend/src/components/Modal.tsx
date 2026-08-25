import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '../lib/utils'

/**
 * Accessible modal shell, per docs/design/design-notes.md §Component
 * conventions: centered, `rounded-xl` (12px), `shadow-lg`, 480px max-width for
 * forms, scrim `rgba(11,58,71,.55)`, `h2` title, actions aligned to the
 * inline-end edge.
 *
 * Accessibility contract (accessibility-layer skill / plan 006, Step 4):
 * - `role="dialog"` + `aria-modal` + `aria-labelledby` pointing at the title.
 * - Focus moves into the dialog on open and returns to the trigger on close.
 * - Tab/Shift+Tab are trapped inside the dialog.
 * - `Escape` closes it, as does a click on the scrim (never a click inside).
 * - Background scrolling is locked while open.
 *
 * The scrim colour is the one runtime-inexpressible token here — it is not a
 * theme colour used anywhere else, so it stays a Tailwind arbitrary value rather
 * than an inline style (.rule/style-rules.md).
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

type ModalProps = {
  /** Rendered only when true — the dialog is unmounted while closed. */
  isOpen: boolean
  onClose: () => void
  title: string
  description?: string
  /** Accessible name for the ✕ button. */
  closeLabel?: string
  children: ReactNode
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  closeLabel = 'סגירה',
  children,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = `${titleId}-description`

  // Focus management: move focus in on open, hand it back to the trigger on close.
  useEffect(() => {
    if (!isOpen) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    // Prefer the first form control over the ✕ button, which precedes it in the
    // DOM: a keyboard/screen-reader user should land on the thing they came to
    // fill in, not on "close".
    const target =
      dialogRef.current?.querySelector<HTMLElement>('input:not([disabled]), textarea, select') ??
      dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    target?.focus()

    return () => previouslyFocused?.focus?.()
  }, [isOpen])

  // Escape to dismiss + Tab trapped inside the dialog.
  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(ev: KeyboardEvent) {
      if (ev.key === 'Escape') {
        ev.stopPropagation()
        onClose()
        return
      }
      if (ev.key !== 'Tab') return

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
      )
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (ev.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
        ev.preventDefault()
        last.focus()
      } else if (!ev.shiftKey && active === last) {
        ev.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [isOpen, onClose])

  // Background must not scroll behind the scrim.
  useEffect(() => {
    if (!isOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(11,58,71,0.55)] px-4"
      // A scrim click dismisses; a click that started inside the panel does not,
      // because the panel stops propagation below.
      onMouseDown={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        onMouseDown={(ev) => ev.stopPropagation()}
        className={cn(
          'w-full max-w-[480px] rounded-xl bg-n-0 p-6 shadow-lg',
          'max-h-[calc(100dvh-32px)] overflow-y-auto',
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-h2 text-primary-900">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-label text-n-500">
                {description}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="rounded-lg p-1 text-n-400 transition hover:bg-n-50 hover:text-n-700"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        {children}
      </div>
    </div>
  )
}
