import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { useCountdown } from './useCountdown'

const NOW = new Date('2026-08-18T09:00:00.000Z')

const inSeconds = (seconds: number) => new Date(NOW.getTime() + seconds * 1000).toISOString()

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts from the time left, not from zero', () => {
    const { result } = renderHook(() => useCountdown(inSeconds(300)))

    expect(result.current).toBe(300_000)
  })

  it('counts down as real time passes', () => {
    const { result } = renderHook(() => useCountdown(inSeconds(300)))

    act(() => {
      vi.advanceTimersByTime(5_000)
    })

    expect(result.current).toBe(295_000)
  })

  it('re-reads the clock rather than decrementing, so a throttled tab cannot drift', () => {
    const { result } = renderHook(() => useCountdown(inSeconds(300)))

    // A single tick fires, but a minute of wall-clock time has actually passed
    // — as happens when a phone sleeps or a background tab is throttled.
    act(() => {
      vi.setSystemTime(new Date(NOW.getTime() + 60_000))
      vi.advanceTimersByTime(1_000)
    })

    // 61s of real time gone, so 239s left. A hook that decremented once per
    // tick would still be claiming 299s.
    expect(result.current).toBe(239_000)
  })

  it('stops at zero rather than counting into negative time', () => {
    const { result } = renderHook(() => useCountdown(inSeconds(2)))

    act(() => {
      vi.advanceTimersByTime(10_000)
    })

    expect(result.current).toBe(0)
  })

  it.each([null, undefined, '', 'not-a-date'])(
    'returns null for the unusable deadline %s, so nothing looks expired',
    (deadline) => {
      const { result } = renderHook(() => useCountdown(deadline))

      expect(result.current).toBeNull()
    },
  )

  it('re-reads a deadline that changes without waiting for the next tick', () => {
    const { result, rerender } = renderHook(({ deadline }) => useCountdown(deadline), {
      initialProps: { deadline: inSeconds(300) },
    })

    rerender({ deadline: inSeconds(60) })

    expect(result.current).toBe(60_000)
  })

  it('stops ticking once unmounted', () => {
    const clearSpy = vi.spyOn(window, 'clearInterval')

    const { unmount } = renderHook(() => useCountdown(inSeconds(300)))
    unmount()

    expect(clearSpy).toHaveBeenCalled()
  })
})
