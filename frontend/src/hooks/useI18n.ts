import { useCallback, useEffect } from 'react'

import { useStore } from '../store/store'
import { directionFor } from '../store/slices/app.slice'
import { translate, type StringKey } from '../i18n/strings'
import type { Direction, Locale } from '../types/i18n.types'

export interface UseI18n {
  locale: Locale
  dir: Direction
  setLocale: (locale: Locale) => void
  t: (key: StringKey, params?: Record<string, string | number>) => string
}

/** Single entry point for reading UI copy and the active language/direction. */
export function useI18n(): UseI18n {
  const locale = useStore((state) => state.locale)
  const setLocale = useStore((state) => state.setLocale)

  const t = useCallback(
    (key: StringKey, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale],
  )

  return { locale, dir: directionFor(locale), setLocale, t }
}

/**
 * Keeps <html lang> and <html dir> in sync with the active locale, so that
 * Tailwind's logical properties (padding/margin/inset start and end) and the
 * browser's bidi algorithm resolve correctly for the whole document.
 */
export function useDocumentDirection(locale: Locale): void {
  useEffect(() => {
    const root = document.documentElement
    root.lang = locale
    root.dir = directionFor(locale)
  }, [locale])
}
