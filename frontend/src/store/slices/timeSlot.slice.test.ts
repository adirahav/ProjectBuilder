import { AxiosError, AxiosHeaders } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useStore } from '../store'
import { timeSlotService } from '../../services/timeSlot.service'
import { todayKey } from '../../utils/date.utils'
import { buildTimeSlot } from '../../test/factories'

vi.mock('../../services/timeSlot.service', async () => {
  // The real conflict predicate is kept: what counts as "someone beat us to it"
  // is exactly the behaviour under test here, so mocking it would test nothing.
  const actual =
    await vi.importActual<typeof import('../../services/timeSlot.service')>(
      '../../services/timeSlot.service',
    )

  return {
    ...actual,
    timeSlotService: { getList: vi.fn(), hold: vi.fn() },
  }
})

const mockedGetList = vi.mocked(timeSlotService.getList)
const mockedHold = vi.mocked(timeSlotService.hold)

function buildConflictError(): AxiosError {
  const error = new AxiosError('Request failed with status code 409')
  error.response = {
    status: 409,
    statusText: 'Conflict',
    data: { error: 'Conflict' },
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  }
  return error
}

const TODAY = todayKey()

describe('timeSlotSlice.loadTimeSlots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStore.setState({
      selectedDate: TODAY,
      timeSlots: [],
      isLoadingTimeSlots: false,
      hasTimeSlotsError: false,
      holdingSlotId: null,
      hasHoldConflict: false,
      heldSlot: null,
    })
  })

  it('puts the fetched open slots in the store', async () => {
    const slots = [buildTimeSlot()]
    mockedGetList.mockResolvedValue(slots)

    await useStore.getState().loadTimeSlots('svc-1', TODAY)

    expect(useStore.getState().timeSlots).toEqual(slots)
  })

  it('flags loading while the request is in flight and clears it after', async () => {
    let resolveList: (slots: never[]) => void = () => {}
    mockedGetList.mockReturnValue(
      new Promise((resolve) => {
        resolveList = resolve as (slots: never[]) => void
      }),
    )

    const pending = useStore.getState().loadTimeSlots('svc-1', TODAY)
    expect(useStore.getState().isLoadingTimeSlots).toBe(true)

    resolveList([])
    await pending

    expect(useStore.getState().isLoadingTimeSlots).toBe(false)
  })

  it('records an error state and rethrows so the page can warn the customer', async () => {
    mockedGetList.mockRejectedValue(new Error('Network Error'))

    await expect(useStore.getState().loadTimeSlots('svc-1', TODAY)).rejects.toThrow('Network Error')

    expect(useStore.getState().hasTimeSlotsError).toBe(true)
    expect(useStore.getState().isLoadingTimeSlots).toBe(false)
    expect(useStore.getState().timeSlots).toEqual([])
  })

  it('drops a stale list on failure so no unavailable time stays clickable', async () => {
    mockedGetList.mockResolvedValueOnce([buildTimeSlot()])
    await useStore.getState().loadTimeSlots('svc-1', TODAY)
    expect(useStore.getState().timeSlots).toHaveLength(1)

    mockedGetList.mockRejectedValueOnce(new Error('Network Error'))
    await expect(useStore.getState().loadTimeSlots('svc-1', TODAY)).rejects.toThrow()

    expect(useStore.getState().timeSlots).toEqual([])
  })

  it('clears a previous error when a retry succeeds', async () => {
    mockedGetList.mockRejectedValueOnce(new Error('Network Error'))
    await expect(useStore.getState().loadTimeSlots('svc-1', TODAY)).rejects.toThrow()

    mockedGetList.mockResolvedValueOnce([buildTimeSlot()])
    await useStore.getState().loadTimeSlots('svc-1', TODAY)

    expect(useStore.getState().hasTimeSlotsError).toBe(false)
  })

  it('ignores a late response for a day the customer already navigated away from', async () => {
    const staleSlots = [buildTimeSlot({ date: '2026-09-01' })]
    let resolveStale: (slots: typeof staleSlots) => void = () => {}
    mockedGetList.mockReturnValue(
      new Promise((resolve) => {
        resolveStale = resolve as (slots: typeof staleSlots) => void
      }),
    )

    const pending = useStore.getState().loadTimeSlots('svc-1', '2026-09-01')
    useStore.getState().setSelectedDate('2026-09-02')

    resolveStale(staleSlots)
    await pending

    expect(useStore.getState().timeSlots).toEqual([])
  })
})

describe('timeSlotSlice.setSelectedDate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStore.setState({ selectedDate: TODAY, hasHoldConflict: false })
  })

  it('defaults the browsed day to today', () => {
    expect(TODAY).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('moves the browsed day', () => {
    useStore.getState().setSelectedDate('2026-09-01')

    expect(useStore.getState().selectedDate).toBe('2026-09-01')
  })

  it('clears a stale conflict banner so it never sits over another day’s times', () => {
    useStore.setState({ hasHoldConflict: true })

    useStore.getState().setSelectedDate('2026-09-01')

    expect(useStore.getState().hasHoldConflict).toBe(false)
  })

  it('leaves the banner alone when the same day is re-selected', () => {
    useStore.setState({ hasHoldConflict: true })

    useStore.getState().setSelectedDate(TODAY)

    expect(useStore.getState().hasHoldConflict).toBe(true)
  })
})

describe('timeSlotSlice.holdTimeSlot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStore.setState({
      selectedDate: TODAY,
      timeSlots: [],
      isLoadingTimeSlots: false,
      hasTimeSlotsError: false,
      holdingSlotId: null,
      hasHoldConflict: false,
      heldSlot: null,
    })
  })

  it('reports success and keeps the slot the server confirmed', async () => {
    const slot = buildTimeSlot({ id: 'slot-1' })
    const held = { ...slot, status: 'held' as const }
    mockedHold.mockResolvedValue(held)

    const outcome = await useStore.getState().holdTimeSlot('svc-1', slot)

    expect(outcome).toBe('held')
    expect(useStore.getState().heldSlot).toEqual(held)
  })

  it('marks which slot is being held while the request is in flight', async () => {
    const slot = buildTimeSlot({ id: 'slot-1' })
    let resolveHold: (held: typeof slot) => void = () => {}
    mockedHold.mockReturnValue(
      new Promise((resolve) => {
        resolveHold = resolve as (held: typeof slot) => void
      }),
    )

    const pending = useStore.getState().holdTimeSlot('svc-1', slot)
    expect(useStore.getState().holdingSlotId).toBe('slot-1')

    resolveHold({ ...slot, status: 'held' })
    await pending

    expect(useStore.getState().holdingSlotId).toBeNull()
  })

  it('does not re-fetch the list on a successful hold', async () => {
    const slot = buildTimeSlot()
    mockedHold.mockResolvedValue({ ...slot, status: 'held' })

    await useStore.getState().holdTimeSlot('svc-1', slot)

    expect(mockedGetList).not.toHaveBeenCalled()
  })

  it('reports a conflict when another customer claimed the slot first', async () => {
    const slot = buildTimeSlot({ id: 'slot-1' })
    mockedHold.mockRejectedValue(buildConflictError())
    mockedGetList.mockResolvedValue([])

    const outcome = await useStore.getState().holdTimeSlot('svc-1', slot)

    expect(outcome).toBe('conflict')
    expect(useStore.getState().hasHoldConflict).toBe(true)
    expect(useStore.getState().heldSlot).toBeNull()
  })

  it('refreshes the list after a conflict so the taken time disappears', async () => {
    const taken = buildTimeSlot({ id: 'slot-1' })
    const remaining = buildTimeSlot({ id: 'slot-2' })
    useStore.setState({ timeSlots: [taken, remaining] })

    mockedHold.mockRejectedValue(buildConflictError())
    mockedGetList.mockResolvedValue([remaining])

    await useStore.getState().holdTimeSlot('svc-1', taken)

    expect(mockedGetList).toHaveBeenCalledWith('svc-1', TODAY)
    expect(useStore.getState().timeSlots).toEqual([remaining])
  })

  it('re-syncs after an unknown failure, since we cannot tell whether the hold landed', async () => {
    const slot = buildTimeSlot()
    mockedHold.mockRejectedValue(new Error('Network Error'))
    mockedGetList.mockResolvedValue([])

    const outcome = await useStore.getState().holdTimeSlot('svc-1', slot)

    expect(outcome).toBe('error')
    expect(mockedGetList).toHaveBeenCalledTimes(1)
    expect(useStore.getState().hasHoldConflict).toBe(false)
  })

  it('still reports the hold outcome when the follow-up refresh also fails', async () => {
    const slot = buildTimeSlot()
    mockedHold.mockRejectedValue(buildConflictError())
    mockedGetList.mockRejectedValue(new Error('Network Error'))

    await expect(useStore.getState().holdTimeSlot('svc-1', slot)).resolves.toBe('conflict')
    expect(useStore.getState().holdingSlotId).toBeNull()
  })

  it('gives exactly one of two customers racing the same slot the hold', async () => {
    // The server is the arbiter: the datastore's atomic update lets one request
    // through and answers the other with 409. This asserts the client maps that
    // outcome faithfully — one 'held', one 'conflict', never two winners.
    const slot = buildTimeSlot({ id: 'slot-1' })
    mockedGetList.mockResolvedValue([])
    mockedHold
      .mockResolvedValueOnce({ ...slot, status: 'held' })
      .mockRejectedValueOnce(buildConflictError())

    const outcomes = await Promise.all([
      useStore.getState().holdTimeSlot('svc-1', slot),
      useStore.getState().holdTimeSlot('svc-1', slot),
    ])

    expect(outcomes.filter((outcome) => outcome === 'held')).toHaveLength(1)
    expect(outcomes.filter((outcome) => outcome === 'conflict')).toHaveLength(1)
  })

  it('clears a previous conflict when the next hold is attempted', async () => {
    useStore.setState({ hasHoldConflict: true })
    const slot = buildTimeSlot()
    mockedHold.mockResolvedValue({ ...slot, status: 'held' })

    await useStore.getState().holdTimeSlot('svc-1', slot)

    expect(useStore.getState().hasHoldConflict).toBe(false)
  })
})

describe('timeSlotSlice.dismissHoldConflict', () => {
  it('hides the banner without touching the loaded times', () => {
    const slots = [buildTimeSlot()]
    useStore.setState({ hasHoldConflict: true, timeSlots: slots })

    useStore.getState().dismissHoldConflict()

    expect(useStore.getState().hasHoldConflict).toBe(false)
    expect(useStore.getState().timeSlots).toEqual(slots)
  })
})
