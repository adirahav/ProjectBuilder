import { beforeEach, describe, expect, it, vi } from 'vitest'
import { tourService } from './tour.service'
import { ApiError, httpService } from './http.service'
import { useStore } from '../store/store'
import type { Tour } from '../types/tour.types'

/** Service-layer tests for the tour domain, with `http.service.ts` mocked. */

vi.mock('./http.service', async () => {
  const actual = await vi.importActual<typeof import('./http.service')>('./http.service')
  return { ...actual, httpService: { ...actual.httpService, get: vi.fn() } }
})

const getMock = vi.mocked(httpService.get)

const TOUR: Tour = { id: 't1', name: 'הגליל העליון', startDate: '2026-04-12' }

beforeEach(() => {
  vi.clearAllMocks()
  useStore.setState({ tours: [] })
})

describe('tourService.getTours', () => {
  it('fetches tours from tour-service', async () => {
    getMock.mockResolvedValue({ tours: [TOUR] })

    await tourService.getTours()

    expect(getMock).toHaveBeenCalledWith('/api/tours', {
      service: 'tour-service',
      withAuth: false,
      signal: undefined,
    })
  })

  it('never attaches the admin JWT — the passenger view is unauthenticated', async () => {
    getMock.mockResolvedValue({ tours: [] })

    await tourService.getTours()

    expect(getMock.mock.calls[0][1]).toMatchObject({ withAuth: false })
  })

  it('writes the fetched tours into the store', async () => {
    getMock.mockResolvedValue({ tours: [TOUR] })

    await tourService.getTours()

    expect(useStore.getState().tours).toEqual([TOUR])
  })

  it('leaves the store untouched and propagates a failure to the caller', async () => {
    getMock.mockRejectedValue(new ApiError(500, 'boom'))

    await expect(tourService.getTours()).rejects.toBeInstanceOf(ApiError)
    expect(useStore.getState().tours).toEqual([])
  })
})
