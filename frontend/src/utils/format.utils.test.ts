import { describe, expect, it } from 'vitest'

import { formatDuration, formatPrice } from './format.utils'

describe('formatPrice', () => {
  it('renders a whole price with the shekel symbol and no decimals', () => {
    const result = formatPrice(220, 'en')

    expect(result).toContain('220')
    expect(result).toContain('₪')
    expect(result).not.toContain('.00')
  })

  it('keeps two decimals when the price is not a whole number', () => {
    const result = formatPrice(99.5, 'en')

    expect(result).toContain('99.50')
  })

  it('renders a shekel amount in Hebrew as well', () => {
    const result = formatPrice(120, 'he')

    expect(result).toContain('120')
    expect(result).toContain('₪')
  })

  it('handles a free (zero) service', () => {
    expect(formatPrice(0, 'en')).toContain('0')
  })
})

describe('formatDuration', () => {
  it('renders sub-hour durations in minutes only', () => {
    expect(formatDuration(45, 'en')).toBe('45 min')
  })

  it('renders a whole hour without a trailing minutes part', () => {
    expect(formatDuration(60, 'en')).toBe('1 h')
  })

  it('renders hours and minutes together', () => {
    expect(formatDuration(90, 'en')).toBe('1 h 30 min')
  })

  it('uses the Hebrew unit labels for the Hebrew locale', () => {
    expect(formatDuration(90, 'he')).toBe('1 שע׳ 30 דק׳')
  })

  it('renders zero minutes rather than an empty string', () => {
    expect(formatDuration(0, 'en')).toBe('0 min')
  })

  it('clamps a negative duration instead of producing nonsense', () => {
    expect(formatDuration(-30, 'en')).toBe('0 min')
  })
})
