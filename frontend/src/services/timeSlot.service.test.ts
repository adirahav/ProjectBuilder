import { AxiosError, AxiosHeaders } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CONFLICT_STATUS, isSlotConflictError, timeSlotService } from './timeSlot.service'
import { httpService } from './http.service'
import { buildTimeSlot } from '../test/factories'

vi.mock('./http.service', () => ({
  httpService: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

const mockedGet = vi.mocked(httpService.get)
const mockedPost = vi.mocked(httpService.post)

/** Builds a real AxiosError so the conflict check is exercised, not simulated. */
function buildAxiosError(status: number): AxiosError {
  const error = new AxiosError('Request failed')
  error.response = {
    status,
    statusText: '',
    data: { error: 'Conflict' },
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  }
  return error
}

describe('timeSlotService.getList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requests the public time-slots endpoint with the service and day', async () => {
    mockedGet.mockResolvedValue([])

    await timeSlotService.getList('svc-1', '2026-08-18')

    expect(mockedGet).toHaveBeenCalledWith('/api/time-slots', {
      serviceId: 'svc-1',
      date: '2026-08-18',
    })
  })

  it('returns the open slots the API sends back', async () => {
    const slots = [buildTimeSlot(), buildTimeSlot()]
    mockedGet.mockResolvedValue(slots)

    expect(await timeSlotService.getList('svc-1', '2026-08-18')).toEqual(slots)
  })

  it('returns an empty array when the day is fully booked', async () => {
    mockedGet.mockResolvedValue([])

    expect(await timeSlotService.getList('svc-1', '2026-08-18')).toEqual([])
  })

  it('never lets a held or booked slot render as available', async () => {
    const open = buildTimeSlot({ status: 'open' })
    mockedGet.mockResolvedValue([
      open,
      buildTimeSlot({ status: 'held' }),
      buildTimeSlot({ status: 'booked' }),
    ])

    expect(await timeSlotService.getList('svc-1', '2026-08-18')).toEqual([open])
  })

  it('refuses to call the API for a malformed date rather than sending a bad query', async () => {
    expect(await timeSlotService.getList('svc-1', '18/08/2026')).toEqual([])
    expect(mockedGet).not.toHaveBeenCalled()
  })

  it('refuses to call the API for an impossible calendar day', async () => {
    expect(await timeSlotService.getList('svc-1', '2026-02-31')).toEqual([])
    expect(mockedGet).not.toHaveBeenCalled()
  })

  it('refuses to call the API without a service id', async () => {
    expect(await timeSlotService.getList('', '2026-08-18')).toEqual([])
    expect(mockedGet).not.toHaveBeenCalled()
  })

  it('degrades to an empty list when the payload is not an array', async () => {
    mockedGet.mockResolvedValue({ unexpected: true } as unknown as never)

    expect(await timeSlotService.getList('svc-1', '2026-08-18')).toEqual([])
  })

  it('propagates an API failure to the caller rather than swallowing it', async () => {
    mockedGet.mockRejectedValue(new Error('Network Error'))

    await expect(timeSlotService.getList('svc-1', '2026-08-18')).rejects.toThrow('Network Error')
  })
})

describe('timeSlotService.hold', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('posts to the hold endpoint for that slot', async () => {
    const slot = buildTimeSlot({ id: 'slot-42' })
    mockedPost.mockResolvedValue({ ...slot, status: 'held' })

    await timeSlotService.hold('slot-42')

    expect(mockedPost).toHaveBeenCalledWith('/api/time-slots/slot-42/hold')
  })

  it('returns the held slot the server confirms, not the one we asked for', async () => {
    const held = buildTimeSlot({ id: 'slot-42', status: 'held' })
    mockedPost.mockResolvedValue(held)

    expect(await timeSlotService.hold('slot-42')).toEqual(held)
  })

  it('rejects with the conflict error when another customer claimed the slot first', async () => {
    mockedPost.mockRejectedValue(buildAxiosError(CONFLICT_STATUS))

    await expect(timeSlotService.hold('slot-42')).rejects.toMatchObject({
      response: { status: 409 },
    })
  })
})

describe('isSlotConflictError', () => {
  it('recognises a 409 as the slot-already-taken case', () => {
    expect(isSlotConflictError(buildAxiosError(409))).toBe(true)
  })

  it('does not mistake a server error for a conflict', () => {
    expect(isSlotConflictError(buildAxiosError(500))).toBe(false)
  })

  it('does not mistake a plain network failure for a conflict', () => {
    expect(isSlotConflictError(new Error('Network Error'))).toBe(false)
  })
})
