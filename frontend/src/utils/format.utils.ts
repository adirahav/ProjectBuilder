import type { Locale } from '../types/i18n.types'
import { translate } from '../i18n/strings'

// The clinic is single-location and prices in shekels only; the PRD states no
// multi-currency requirement, so the currency is fixed here rather than being
// carried on every Service record.
const CURRENCY = 'ILS'

const INTL_LOCALES: Record<Locale, string> = {
  he: 'he-IL',
  en: 'en-IL',
}

export function toIntlLocale(locale: Locale): string {
  return INTL_LOCALES[locale]
}

// Renders a price with its currency symbol, dropping the decimal part when the
// amount is whole (₪120 reads better than ₪120.00 on a price list).
export function formatPrice(amount: number, locale: Locale): string {
  const hasFraction = !Number.isInteger(amount)

  return new Intl.NumberFormat(toIntlLocale(locale), {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  }).format(amount)
}

// Renders a duration in minutes as hours + minutes using the active locale's
// short unit labels, e.g. 90 -> "1h 30min" / "1 שע׳ 30 דק׳".
export function formatDuration(totalMinutes: number, locale: Locale): string {
  const safeMinutes = Math.max(0, Math.round(totalMinutes))
  const hours = Math.floor(safeMinutes / 60)
  const minutes = safeMinutes % 60

  const numberFormat = new Intl.NumberFormat(toIntlLocale(locale))
  const parts: string[] = []

  if (hours > 0) {
    parts.push(`${numberFormat.format(hours)} ${translate(locale, 'duration.hourShort')}`)
  }
  if (minutes > 0 || hours === 0) {
    parts.push(`${numberFormat.format(minutes)} ${translate(locale, 'duration.minuteShort')}`)
  }

  return parts.join(' ')
}
