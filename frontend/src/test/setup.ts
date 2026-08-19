import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup, configure } from '@testing-library/react'

import type { RootState } from '../store/store'

// Testing Library's 1s default for findBy*/waitFor assumes a render settles
// almost immediately. A route change that re-renders a whole screen under jsdom
// on a loaded machine can take longer than that, which made the cross-screen
// navigation tests fail on the clock rather than on behaviour. Waiting longer
// costs nothing when the assertion passes — it only bounds a genuine failure.
configure({ asyncUtilTimeout: 5_000 })

// jsdom has no matchMedia; framer-motion's useReducedMotion needs it. Defaulting
// `matches` to false means tests exercise the animated path, which is the one
// real users get.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

// The store is imported lazily, never at setup-file load time: a module pulled
// in here would be cached before a test file's `vi.mock` calls are applied,
// silently defeating every mock of anything the store imports (http.service,
// service.service, …). Each test file gets its own module registry, so the
// first dynamic import below resolves against that file's mocks.
let initialStoreState: RootState | null = null

beforeEach(async () => {
  const { useStore } = await import('../store/store')

  // Snapshot the pristine store (state + actions) once per test file, so every
  // test starts from the same place and no test can leak state into the next.
  initialStoreState ??= useStore.getState()
  useStore.setState(initialStoreState, true)

  localStorage.clear()
  document.documentElement.dir = ''
  document.documentElement.lang = ''
})

afterEach(() => {
  cleanup()
})
