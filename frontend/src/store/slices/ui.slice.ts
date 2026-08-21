import type { StateCreator } from 'zustand'

import type { RootState } from '../store'

/** What `closeTopModal` managed to do, so the caller can respond honestly. */
export type CloseTopModalOutcome =
  /** A modal was open and has been asked to close. */
  | 'closed'
  /** A modal was open but is mid-write and refuses to be dismissed. */
  | 'blocked'
  /** Nothing was open. */
  | 'none'

export interface ModalRegistration {
  /** Stable per mounted ModalDialog instance. */
  id: string
  /**
   * Dismisses this dialog. Returns false when dismissal is currently blocked
   * (a write is in flight), so the caller can say so rather than appear frozen.
   */
  close: () => boolean
}

export interface UiSlice {
  /**
   * Every currently open ModalDialog, in the order they opened. The last entry
   * is the topmost one — dialogs can stack (a confirm inside a form), and the
   * native back button must only ever reach the top of that stack.
   */
  openModals: ModalRegistration[]
  registerModal: (registration: ModalRegistration) => void
  unregisterModal: (id: string) => void
  /** Asks the topmost open modal to close. Used by the native back button. */
  closeTopModal: () => CloseTopModalOutcome
}

/**
 * A registry of open modals, kept in the store rather than in each dialog.
 *
 * The native back button is a single app-level listener: by the time it fires
 * it has no idea which of `CancelAppointmentDialog`, `DeactivateServiceDialog`
 * or `ServiceForm` might be on screen. Rather than teach it about each one — a
 * list that would silently go stale the moment a fourth dialog is added — the
 * shared ModalDialog primitive registers itself here while it is open. Any
 * dialog built on it is covered automatically, with no per-consumer wiring.
 */
export const createUiSlice: StateCreator<RootState, [], [], UiSlice> = (set, get) => ({
  openModals: [],

  registerModal: (registration) => {
    set((state) => ({
      // Replace rather than append on a repeat id: a remount must not leave a
      // phantom entry behind that would swallow a later back press.
      openModals: [...state.openModals.filter((m) => m.id !== registration.id), registration],
    }))
  },

  unregisterModal: (id) => {
    set((state) => ({ openModals: state.openModals.filter((m) => m.id !== id) }))
  },

  closeTopModal: () => {
    const { openModals } = get()
    if (openModals.length === 0) return 'none'

    const top = openModals[openModals.length - 1]
    // The dialog removes itself from the registry via its own unmount/close
    // effect — doing it here as well would race that cleanup.
    return top.close() ? 'closed' : 'blocked'
  },
})
