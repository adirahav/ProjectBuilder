import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useStore } from '../store'
import { LOCALE_STORAGE_KEY, directionFor } from './app.slice'
import { utilService } from '../../services/util.service'

vi.mock('../../services/util.service', () => ({
  utilService: {
    saveToStorage: vi.fn(),
    getFromStorage: vi.fn(),
    removeFromStorage: vi.fn(),
  },
}))

const mockedSave = vi.mocked(utilService.saveToStorage)
const mockedGet = vi.mocked(utilService.getFromStorage)

describe('directionFor', () => {
  it('maps Hebrew to RTL and English to LTR', () => {
    expect(directionFor('he')).toBe('rtl')
    expect(directionFor('en')).toBe('ltr')
  })
})

describe('appSlice locale', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedSave.mockResolvedValue(undefined)
    mockedGet.mockResolvedValue(null)
  })

  it('defaults to Hebrew, the clinic customers default language', () => {
    expect(useStore.getState().locale).toBe('he')
  })

  it('switches the language and persists the choice', () => {
    useStore.getState().setLocale('en')

    expect(useStore.getState().locale).toBe('en')
    expect(mockedSave).toHaveBeenCalledWith(LOCALE_STORAGE_KEY, 'en')
  })

  it('does not re-persist when the chosen language is already active', () => {
    useStore.getState().setLocale('he')

    expect(mockedSave).not.toHaveBeenCalled()
  })

  it('still switches the language when persistence fails', async () => {
    mockedSave.mockRejectedValue(new Error('storage unavailable'))

    useStore.getState().setLocale('en')
    await Promise.resolve()

    expect(useStore.getState().locale).toBe('en')
  })

  it('restores a persisted language on startup', async () => {
    mockedGet.mockResolvedValue('en')

    await useStore.getState().hydrateLocale()

    expect(useStore.getState().locale).toBe('en')
    expect(useStore.getState().isHydratingLocale).toBe(false)
  })

  it('ignores a corrupted stored value and keeps the default', async () => {
    mockedGet.mockResolvedValue('klingon')

    await useStore.getState().hydrateLocale()

    expect(useStore.getState().locale).toBe('he')
  })

  it('finishes hydrating even when storage throws', async () => {
    mockedGet.mockRejectedValue(new Error('storage unavailable'))

    await useStore.getState().hydrateLocale()

    expect(useStore.getState().isHydratingLocale).toBe(false)
    expect(useStore.getState().locale).toBe('he')
  })
})
