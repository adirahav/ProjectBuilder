import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import { ModalDialog } from './ModalDialog'
import { useStore } from '../../store/store'

function renderDialog(props: Partial<Parameters<typeof ModalDialog>[0]> = {}) {
  return render(
    <ModalDialog
      isOpen
      title="Cancel the appointment?"
      closeLabel="Close this question"
      onClose={vi.fn()}
      {...props}
    >
      <button type="button">Keep it</button>
    </ModalDialog>,
  )
}

/**
 * The native back button finds open dialogs through the store registry, not by
 * knowing about each dialog component. If the shared primitive stops
 * registering, every dialog in the app silently loses back-button dismissal at
 * once — which is exactly the failure these tests exist to catch.
 */
describe('ModalDialog — native back-button registry', () => {
  it('registers itself while it is open', () => {
    renderDialog()

    expect(useStore.getState().openModals).toHaveLength(1)
  })

  it('does not register while it is closed', () => {
    renderDialog({ isOpen: false })

    expect(useStore.getState().openModals).toEqual([])
  })

  it('unregisters when it unmounts', () => {
    const { unmount } = renderDialog()
    expect(useStore.getState().openModals).toHaveLength(1)

    unmount()

    expect(useStore.getState().openModals).toEqual([])
  })

  it('unregisters when it is closed without unmounting', () => {
    const { rerender } = renderDialog()

    rerender(
      <ModalDialog
        isOpen={false}
        title="Cancel the appointment?"
        closeLabel="Close this question"
        onClose={vi.fn()}
      >
        <button type="button">Keep it</button>
      </ModalDialog>,
    )

    expect(useStore.getState().openModals).toEqual([])
  })

  it('closes via the registry, the same way a back press would', () => {
    const onClose = vi.fn()
    renderDialog({ onClose })

    expect(useStore.getState().closeTopModal()).toBe('closed')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('reports blocked, and does not close, while a write is in flight', () => {
    const onClose = vi.fn()
    renderDialog({ onClose, isDismissDisabled: true })

    expect(useStore.getState().closeTopModal()).toBe('blocked')
    expect(onClose).not.toHaveBeenCalled()
    // Still on screen — a blocked press must not tear the dialog down.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes through the latest onClose after the prop changes', () => {
    // Registration is intentionally not re-created on every callback identity
    // change, so it must still reach the current handler.
    const stale = vi.fn()
    const fresh = vi.fn()
    const { rerender } = renderDialog({ onClose: stale })

    rerender(
      <ModalDialog
        isOpen
        title="Cancel the appointment?"
        closeLabel="Close this question"
        onClose={fresh}
      >
        <button type="button">Keep it</button>
      </ModalDialog>,
    )

    useStore.getState().closeTopModal()

    expect(fresh).toHaveBeenCalledTimes(1)
    expect(stale).not.toHaveBeenCalled()
  })
})
