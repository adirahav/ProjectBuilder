import { describe, expect, it, vi } from 'vitest'

import { useStore } from '../store'

describe('ui.slice — open-modal registry', () => {
  it('starts with no modal open', () => {
    expect(useStore.getState().openModals).toEqual([])
    expect(useStore.getState().closeTopModal()).toBe('none')
  })

  it('closes the registered modal and reports it', () => {
    const close = vi.fn(() => true)
    useStore.getState().registerModal({ id: 'a', close })

    expect(useStore.getState().closeTopModal()).toBe('closed')
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('closes only the topmost modal when dialogs are stacked', () => {
    const first = vi.fn(() => true)
    const second = vi.fn(() => true)
    useStore.getState().registerModal({ id: 'a', close: first })
    useStore.getState().registerModal({ id: 'b', close: second })

    useStore.getState().closeTopModal()

    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
  })

  it('reports a blocked close when the dialog refuses to be dismissed', () => {
    // A dialog mid-write returns false; the caller needs to know so it can say
    // so rather than swallow the press silently.
    useStore.getState().registerModal({ id: 'a', close: () => false })

    expect(useStore.getState().closeTopModal()).toBe('blocked')
  })

  it('stops treating a modal as open once it unregisters', () => {
    const close = vi.fn(() => true)
    useStore.getState().registerModal({ id: 'a', close })
    useStore.getState().unregisterModal('a')

    expect(useStore.getState().openModals).toEqual([])
    expect(useStore.getState().closeTopModal()).toBe('none')
    expect(close).not.toHaveBeenCalled()
  })

  it('replaces rather than duplicates a re-registered id', () => {
    // A remount under the same id must not leave a phantom entry that would
    // swallow a later back press.
    const stale = vi.fn(() => true)
    const fresh = vi.fn(() => true)
    useStore.getState().registerModal({ id: 'a', close: stale })
    useStore.getState().registerModal({ id: 'a', close: fresh })

    expect(useStore.getState().openModals).toHaveLength(1)
    useStore.getState().closeTopModal()
    expect(fresh).toHaveBeenCalledTimes(1)
    expect(stale).not.toHaveBeenCalled()
  })

  it('leaves other modals untouched when one unregisters', () => {
    const first = vi.fn(() => true)
    const second = vi.fn(() => true)
    useStore.getState().registerModal({ id: 'a', close: first })
    useStore.getState().registerModal({ id: 'b', close: second })

    useStore.getState().unregisterModal('b')

    expect(useStore.getState().closeTopModal()).toBe('closed')
    expect(first).toHaveBeenCalledTimes(1)
  })
})
