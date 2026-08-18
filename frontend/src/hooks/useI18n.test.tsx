import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { useDocumentDirection, useI18n } from './useI18n'

describe('useI18n', () => {
  it('translates using the active locale', () => {
    const { result } = renderHook(() => useI18n())

    expect(result.current.t('service.book')).toBe('הזמנת תור')
  })

  it('re-translates every string after the language is switched', () => {
    const { result } = renderHook(() => useI18n())

    act(() => result.current.setLocale('en'))

    expect(result.current.locale).toBe('en')
    expect(result.current.t('service.book')).toBe('Book')
  })

  it('reports the direction that matches the active language', () => {
    const { result } = renderHook(() => useI18n())
    expect(result.current.dir).toBe('rtl')

    act(() => result.current.setLocale('en'))
    expect(result.current.dir).toBe('ltr')
  })

  it('substitutes parameters into a phrase', () => {
    const { result } = renderHook(() => useI18n())

    expect(result.current.t('service.bookAria', { name: 'תספורת' })).toContain('תספורת')
  })
})

describe('useDocumentDirection', () => {
  it('writes lang and dir onto <html> so logical properties resolve', () => {
    const { rerender } = renderHook(({ locale }) => useDocumentDirection(locale), {
      initialProps: { locale: 'he' as const },
    })

    expect(document.documentElement.lang).toBe('he')
    expect(document.documentElement.dir).toBe('rtl')

    rerender({ locale: 'en' as unknown as 'he' })

    expect(document.documentElement.lang).toBe('en')
    expect(document.documentElement.dir).toBe('ltr')
  })
})
