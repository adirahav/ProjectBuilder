import { useEffect, useState } from 'react'

import { parseInstant } from '../utils/date.utils'

const TICK_MS = 1000

/**
 * Milliseconds left until an ISO-8601 deadline, re-read once a second.
 *
 * Returns `null` — not `0` — when there is no usable deadline, so "the server
 * did not tell us when this lapses" is distinguishable from "it has lapsed".
 * Conflating the two would expire a perfectly good hold in front of the
 * Customer just because a field was missing from a response.
 *
 * The remaining time is *derived* on every render from the deadline and the
 * current clock, never decremented and never mirrored into state. Two things
 * follow from that: a backgrounded tab, a throttled timer or a sleeping phone
 * cannot make the countdown drift slower than real time, and a changed deadline
 * takes effect on the very next render instead of a tick later. The interval
 * exists only to schedule those renders.
 *
 * It is still only a hint: the server's 409 on submit is what actually decides
 * whether the hold stands.
 */
export function useCountdown(deadline: string | null | undefined): number | null {
  // A bare re-render trigger. The value is meaningless — the clock, not this
  // counter, is what the returned figure is computed from.
  const [, setTick] = useState(0)

  useEffect(() => {
    // Nothing to count down to: no timer is started, so an idle screen with no
    // deadline costs nothing.
    if (!parseInstant(deadline)) return

    const intervalId = window.setInterval(() => {
      setTick((tick) => tick + 1)
    }, TICK_MS)

    return () => window.clearInterval(intervalId)
  }, [deadline])

  return remainingUntil(deadline)
}

function remainingUntil(deadline: string | null | undefined): number | null {
  const parsed = parseInstant(deadline)
  if (!parsed) return null

  return Math.max(0, parsed.getTime() - Date.now())
}
