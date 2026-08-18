import type { StateCreator } from 'zustand'

import type { Direction, Locale } from '../../types/i18n.types'
import { DEFAULT_LOCALE, isLocale } from '../../i18n/strings'
import { utilService } from '../../services/util.service'
import type { RootState } from '../store'

export const LOCALE_STORAGE_KEY = 'locale'

export function directionFor(locale: Locale): Direction {
  return locale === 'he' ? 'rtl' : 'ltr'
}

export interface AppSlice {
  /** Active UI language. Hebrew (RTL) is the default per the PRD. */
  locale: Locale
  /** True until the persisted language preference has been read from storage. */
  isHydratingLocale: boolean
  setLocale: (locale: Locale) => void
  hydrateLocale: () => Promise<void>
}

export const createAppSlice: StateCreator<RootState, [], [], AppSlice> = (set, get) => ({
  locale: DEFAULT_LOCALE,
  isHydratingLocale: true,

  setLocale: (locale) => {
    if (get().locale === locale) return

    set({ locale })
    // Persistence is best-effort: a storage failure must never block the
    // language actually switching in the UI.
    void utilService.saveToStorage(LOCALE_STORAGE_KEY, locale).catch(() => {
      console.log('[APP] could not persist language preference')
    })
  },

  hydrateLocale: async () => {
    try {
      const stored = await utilService.getFromStorage(LOCALE_STORAGE_KEY)
      if (isLocale(stored)) set({ locale: stored })
    } catch {
      console.log('[APP] could not read persisted language preference')
    } finally {
      set({ isHydratingLocale: false })
    }
  },
})
