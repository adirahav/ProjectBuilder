import { beforeEach, describe, expect, it, vi } from 'vitest'
import { manifestService } from './manifest.service'
import { ApiError, httpService } from './http.service'
import { useStore } from '../store/store'
import type { Manifest } from '../types/manifest.types'

/**
 * Service-layer tests for the passenger manifest (F15).
 *
 * `http.service.ts` is mocked rather than hitting a real API
 * (.rule/testing-rules.md), so these assert the service's own behaviour:
 * routing, the authenticated-call requirement, and the store write — including
 * the guard that keeps one bus's PII from landing as another bus's manifest.
 */

vi.mock('./http.service', async () => {
  const actual = await vi.importActual<typeof import('./http.service')>('./http.service')
  return {
    ...actual,
    httpService: { ...actual.httpService, get: vi.fn() },
  }
})

const getMock = vi.mocked(httpService.get)

function buildManifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    bus: { id: 'b1', name: 'אוטובוס 1', seatCount: 2 },
    rows: [
      {
        seatId: 's1',
        seatLabel: '1',
        status: 'taken',
        fullName: 'נועה לוי',
        phone: '0524471903',
        pickupPoint: 'צומת גלילות',
      },
      { seatId: 's2', seatLabel: '2', status: 'available' },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useStore.setState({ selectedBusId: 'b1', manifest: null })
})

describe('manifestService.getManifest', () => {
  it('requests the admin manifest route for the given bus', async () => {
    getMock.mockResolvedValue(buildManifest())

    await manifestService.getManifest('b1')

    expect(getMock).toHaveBeenCalledWith(
      '/api/buses/b1/manifest',
      expect.objectContaining({ service: 'tour-service' }),
    )
  })

  it('sends the admin JWT — this is the one PII route, never a public call', async () => {
    getMock.mockResolvedValue(buildManifest())

    await manifestService.getManifest('b1')

    expect(getMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ withAuth: true }),
    )
  })

  it('encodes the bus id into the path', async () => {
    getMock.mockResolvedValue(buildManifest())
    useStore.setState({ selectedBusId: 'b 1/x' })

    await manifestService.getManifest('b 1/x')

    expect(getMock).toHaveBeenCalledWith('/api/buses/b%201%2Fx/manifest', expect.anything())
  })

  it('writes the manifest to the store itself, so components need not', async () => {
    const manifest = buildManifest()
    getMock.mockResolvedValue(manifest)

    await manifestService.getManifest('b1')

    expect(useStore.getState().manifest).toEqual(manifest)
  })

  it('drops a late response for a bus the admin already switched away from', async () => {
    getMock.mockResolvedValue(buildManifest())
    useStore.setState({ selectedBusId: 'b2', manifest: null })

    const returned = await manifestService.getManifest('b1')

    // Still returned to the caller, but never written — another bus's passenger
    // PII must not land as the current bus's manifest.
    expect(returned.bus.id).toBe('b1')
    expect(useStore.getState().manifest).toBeNull()
  })

  it('lets an authorization failure propagate to the caller', async () => {
    getMock.mockRejectedValue(new ApiError(403, 'Forbidden', 'FORBIDDEN'))

    await expect(manifestService.getManifest('b1')).rejects.toBeInstanceOf(ApiError)
    expect(useStore.getState().manifest).toBeNull()
  })
})

describe('manifest store cascade', () => {
  it('clears the manifest when the selected bus changes', () => {
    useStore.setState({ manifest: buildManifest() })

    useStore.getState().selectBus('b2')

    expect(useStore.getState().manifest).toBeNull()
  })

  it('clears the manifest when the selected tour changes', () => {
    useStore.setState({ manifest: buildManifest() })

    useStore.getState().selectTour('t2')

    expect(useStore.getState().manifest).toBeNull()
  })
})
