import type { Locale } from '../types/i18n.types'

// Lightweight phrase table — the app is bilingual (Hebrew default/RTL, English
// LTR) but does not need a full i18n runtime. Every user-facing string in the
// app is looked up here; never hardcode copy inside a component.
//
// `en` is the shape-defining dictionary: every other locale must supply exactly
// the same keys, which TypeScript enforces via the Dictionary type below.
const en = {
  'brand.name': 'Dog Grooming Studio',

  'common.retry': 'Try again',
  'common.skipToContent': 'Skip to content',

  'language.switchAria': 'Change language',
  'language.he': 'עברית',
  'language.en': 'English',

  'serviceList.title': 'Our services',
  'serviceList.subtitle': 'Pick a treatment for your dog and choose a time that suits you.',
  'serviceList.regionLabel': 'Available services',
  'serviceList.loading': 'Loading services…',
  'serviceList.empty.title': 'No services available right now',
  'serviceList.empty.body': 'Please check back later, or contact the clinic directly.',
  'serviceList.error.title': 'We could not load the services',
  'serviceList.error.body': 'Check your internet connection and try again.',
  'serviceList.error.toast': 'Loading services failed. Please try again.',

  'service.durationLabel': 'Duration',
  'service.priceLabel': 'Price',
  'service.book': 'Book',
  'service.bookAria': 'Book {name}',

  'duration.hourShort': 'h',
  'duration.minuteShort': 'min',

  'book.title': 'Book {name}',
  'book.titleFallback': 'Book an appointment',
  'book.comingSoon.title': 'Time slot picker coming soon',
  'book.comingSoon.body':
    'Choosing a date and time is not available yet. It will appear here shortly.',
  'book.back': 'Back to services',
} as const

export type StringKey = keyof typeof en

type Dictionary = Record<StringKey, string>

const he: Dictionary = {
  'brand.name': 'מספרה לכלבים',

  'common.retry': 'נסו שוב',
  'common.skipToContent': 'דילוג לתוכן הראשי',

  'language.switchAria': 'החלפת שפה',
  'language.he': 'עברית',
  'language.en': 'English',

  'serviceList.title': 'השירותים שלנו',
  'serviceList.subtitle': 'בחרו טיפול לכלב שלכם והמשיכו לבחירת מועד שנוח לכם.',
  'serviceList.regionLabel': 'שירותים זמינים',
  'serviceList.loading': 'טוענים את השירותים…',
  'serviceList.empty.title': 'אין שירותים זמינים כרגע',
  'serviceList.empty.body': 'נסו שוב מאוחר יותר, או צרו קשר ישירות עם המספרה.',
  'serviceList.error.title': 'לא הצלחנו לטעון את השירותים',
  'serviceList.error.body': 'בדקו את החיבור לאינטרנט ונסו שוב.',
  'serviceList.error.toast': 'טעינת השירותים נכשלה. נסו שוב.',

  'service.durationLabel': 'משך הטיפול',
  'service.priceLabel': 'מחיר',
  'service.book': 'הזמנת תור',
  'service.bookAria': 'הזמנת תור לשירות {name}',

  'duration.hourShort': 'שע׳',
  'duration.minuteShort': 'דק׳',

  'book.title': 'הזמנת תור לשירות {name}',
  'book.titleFallback': 'הזמנת תור',
  'book.comingSoon.title': 'בחירת מועד תהיה זמינה בקרוב',
  'book.comingSoon.body': 'בחירת תאריך ושעה עדיין אינה זמינה. היא תופיע כאן בקרוב.',
  'book.back': 'חזרה לרשימת השירותים',
}

export const dictionaries: Record<Locale, Dictionary> = { he, en }

export const LOCALES: readonly Locale[] = ['he', 'en'] as const

export const DEFAULT_LOCALE: Locale = 'he'

export function isLocale(value: unknown): value is Locale {
  return value === 'he' || value === 'en'
}

// Resolves a phrase and substitutes {placeholder} tokens. Falls back to the key
// itself so a missing string is visible in the UI rather than rendering blank.
export function translate(
  locale: Locale,
  key: StringKey,
  params?: Record<string, string | number>,
): string {
  const phrase = dictionaries[locale]?.[key] ?? key
  if (!params) return phrase

  return phrase.replace(/\{(\w+)\}/g, (match, token: string) =>
    token in params ? String(params[token]) : match,
  )
}
