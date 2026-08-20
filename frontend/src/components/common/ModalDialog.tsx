import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

import { cn } from '../../lib/utils'

interface ModalDialogProps {
  isOpen: boolean
  /** Accessible name of the dialog — rendered as its heading. */
  title: string
  /** Optional supporting line under the title, wired to `aria-describedby`. */
  description?: string
  /** Label for the icon-only close button; icons alone are unreachable. */
  closeLabel: string
  /** Called on Escape, on backdrop click, and on the close button. */
  onClose: () => void
  /**
   * Blocks the dismiss paths while a write is in flight. Closing mid-request
   * would leave the Admin with no idea whether the write landed.
   */
  isDismissDisabled?: boolean
  children: ReactNode
}

/** Everything focusable inside the dialog, in document order. */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * A modal dialog with the three behaviours a keyboard or screen-reader user
 * needs and that a bare `<div>` overlay never has (accessibility-layer):
 *
 * - focus moves into the dialog when it opens and returns to whatever opened it
 *   when it closes, so the Admin does not land back at the top of the document;
 * - Tab and Shift+Tab cycle inside the dialog rather than wandering into the
 *   page behind it, which is unreachable anyway;
 * - Escape closes it, and the background page is marked `aria-hidden` via
 *   `role="dialog" aria-modal`, so assistive tech does not read through it.
 *
 * The backdrop is a plain element with a click handler rather than a button:
 * clicking it is a mouse convenience that duplicates the close button and the
 * Escape key, so it must not appear as a second, unlabelled control in the tab
 * order.
 */
export function ModalDialog({
  isOpen,
  title,
  description,
  closeLabel,
  onClose,
  isDismissDisabled = false,
  children,
}: ModalDialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  const titleId = useId()
  const descriptionId = `${titleId}-description`

  const requestClose = useCallback(() => {
    if (isDismissDisabled) return
    onClose()
  }, [isDismissDisabled, onClose])

  // Remember who opened the dialog, so focus has somewhere sensible to return.
  useEffect(() => {
    if (!isOpen) return

    openerRef.current = document.activeElement as HTMLElement | null
    const opener = openerRef.current

    // The first field, when there is one — otherwise the panel itself, which is
    // tabindex="-1" precisely so it can hold focus without joining the tab order.
    const focusables = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    const first = focusables && focusables.length > 0 ? focusables[0] : panelRef.current
    first?.focus()

    return () => opener?.focus?.()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        requestClose()
        return
      }

      if (event.key !== 'Tab') return

      const focusables = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
      )
      if (focusables.length === 0) return

      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement

      // Wrap at both ends, and pull focus back in if it somehow escaped.
      if (event.shiftKey && (active === first || !panelRef.current?.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [isOpen, requestClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-4"
        >
          <div
            aria-hidden="true"
            onClick={requestClose}
            className="fixed inset-0 bg-neutral-900/50"
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.18 }}
            className={cn(
              'relative z-10 flex w-full max-w-lg flex-col gap-5 bg-white p-6 shadow-xl',
              'rounded-t-2xl sm:rounded-2xl md:p-8',
              'focus-visible:outline-none',
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1 text-start">
                <h2 id={titleId} className="text-xl font-semibold text-neutral-900">
                  {title}
                </h2>
                {description && (
                  <p id={descriptionId} className="text-sm text-neutral-900/70">
                    {description}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={requestClose}
                disabled={isDismissDisabled}
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-xl',
                  'text-neutral-900/60 transition-colors hover:bg-primary-light hover:text-primary',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  isDismissDisabled && 'cursor-not-allowed opacity-50',
                )}
              >
                <X className="size-5" aria-hidden="true" />
                <span className="sr-only">{closeLabel}</span>
              </button>
            </div>

            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
