import { describe, expect, it } from 'vitest'

import { dictionaries, isLocale, LOCALES, translate } from './strings'

describe('phrase table', () => {
  it('defines exactly the same keys in every locale', () => {
    const [reference, ...rest] = LOCALES.map((locale) => Object.keys(dictionaries[locale]).sort())

    for (const keys of rest) {
      expect(keys).toEqual(reference)
    }
  })

  it('has no blank phrase in any locale', () => {
    for (const locale of LOCALES) {
      for (const [key, phrase] of Object.entries(dictionaries[locale])) {
        expect(phrase.trim(), `${locale}.${key} is empty`).not.toBe('')
      }
    }
  })
})

describe('translate', () => {
  it('returns the phrase for the active locale', () => {
    expect(translate('en', 'service.book')).toBe('Book')
    expect(translate('he', 'service.book')).toBe('הזמנת תור')
  })

  it('substitutes named parameters', () => {
    expect(translate('en', 'service.bookAria', { name: 'Full groom' })).toBe('Book Full groom')
  })

  it('leaves an unmatched placeholder intact rather than blanking it', () => {
    expect(translate('en', 'service.bookAria', { other: 'x' })).toBe('Book {name}')
  })
})

describe('isLocale', () => {
  it.each(['he', 'en'])('accepts the supported locale %s', (value) => {
    expect(isLocale(value)).toBe(true)
  })

  it.each([null, undefined, 'fr', 42, {}])('rejects %s', (value) => {
    expect(isLocale(value)).toBe(false)
  })
})
