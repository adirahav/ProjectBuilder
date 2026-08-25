import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

/**
 * Global test setup: jest-dom matchers plus a DOM teardown after every test, so
 * no state leaks between cases (.rule/testing-rules.md — "Avoid shared mutable
 * state between tests").
 */
afterEach(() => {
  cleanup()
  globalThis.localStorage?.clear()
})
