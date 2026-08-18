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
  'book.subtitle': 'Pick a date, then choose one of the available times.',
  'book.back': 'Back to services',

  'timeSlot.dateLabel': 'Date',
  'timeSlot.previousDay': 'Previous day',
  'timeSlot.nextDay': 'Next day',
  'timeSlot.today': 'Today',
  'timeSlot.regionLabel': 'Available times on {date}',
  'timeSlot.loading': 'Loading available times…',
  'timeSlot.empty.title': 'No available times on this day',
  'timeSlot.empty.body': 'Every time on {date} is taken. Try another date.',
  'timeSlot.pastDate.title': 'This date has already passed',
  'timeSlot.pastDate.body': 'Pick today or a later date to see available times.',
  'timeSlot.error.title': 'We could not load the available times',
  'timeSlot.error.body': 'Check your internet connection and try again.',
  'timeSlot.error.toast': 'Loading the available times failed. Please try again.',

  'timeSlot.status.open': 'Available',
  'timeSlot.status.held': 'Being booked',
  'timeSlot.status.booked': 'Booked',

  'timeSlot.holdAria': 'Choose {time}, available',
  'timeSlot.holding': 'Holding…',
  'timeSlot.hold.successToast': 'This time is held for you. Continue to your details.',
  'timeSlot.hold.errorToast': 'We could not hold that time. Please try again.',
  'timeSlot.conflict.title': 'That time was just taken',
  'timeSlot.conflict.body':
    'Another customer booked it a moment ago. The times below are up to date — please choose another one.',
  'timeSlot.conflict.dismiss': 'Dismiss this message',
  'timeSlot.conflict.toast': 'That time was just taken — please choose another.',

  'details.title': 'Your details',
  'details.comingSoon.title': 'The details form is coming soon',
  'details.comingSoon.body':
    'Your time is held while you finish booking. Entering your contact details will be available here shortly.',
  'details.heldLabel': 'Time held for you',
  'details.noHold.title': 'No time is held yet',
  'details.noHold.body': 'Choose an available time first, and we will hold it while you book.',
  'details.back': 'Back to time selection',
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
  'book.subtitle': 'בחרו תאריך, ולאחר מכן בחרו אחת מהשעות הפנויות.',
  'book.back': 'חזרה לרשימת השירותים',

  'timeSlot.dateLabel': 'תאריך',
  'timeSlot.previousDay': 'ליום הקודם',
  'timeSlot.nextDay': 'ליום הבא',
  'timeSlot.today': 'היום',
  'timeSlot.regionLabel': 'שעות פנויות בתאריך {date}',
  'timeSlot.loading': 'טוענים את השעות הפנויות…',
  'timeSlot.empty.title': 'אין שעות פנויות ביום זה',
  'timeSlot.empty.body': 'כל השעות בתאריך {date} תפוסות. נסו תאריך אחר.',
  'timeSlot.pastDate.title': 'התאריך הזה כבר עבר',
  'timeSlot.pastDate.body': 'בחרו את היום או תאריך מאוחר יותר כדי לראות שעות פנויות.',
  'timeSlot.error.title': 'לא הצלחנו לטעון את השעות הפנויות',
  'timeSlot.error.body': 'בדקו את החיבור לאינטרנט ונסו שוב.',
  'timeSlot.error.toast': 'טעינת השעות הפנויות נכשלה. נסו שוב.',

  'timeSlot.status.open': 'פנוי',
  'timeSlot.status.held': 'בתהליך הזמנה',
  'timeSlot.status.booked': 'תפוס',

  'timeSlot.holdAria': 'בחירת השעה {time}, פנויה',
  'timeSlot.holding': 'שומרים את השעה…',
  'timeSlot.hold.successToast': 'השעה שמורה עבורכם. המשיכו למילוי הפרטים.',
  'timeSlot.hold.errorToast': 'לא הצלחנו לשמור את השעה. נסו שוב.',
  'timeSlot.conflict.title': 'השעה הזו נתפסה הרגע',
  'timeSlot.conflict.body': 'לקוח אחר הזמין אותה לפני רגע. השעות שלמטה מעודכנות — בחרו שעה אחרת.',
  'timeSlot.conflict.dismiss': 'סגירת ההודעה',
  'timeSlot.conflict.toast': 'השעה הזו נתפסה הרגע — בחרו שעה אחרת.',

  'details.title': 'הפרטים שלכם',
  'details.comingSoon.title': 'טופס הפרטים יהיה זמין בקרוב',
  'details.comingSoon.body':
    'השעה שמורה עבורכם עד להשלמת ההזמנה. מילוי פרטי הקשר יתאפשר כאן בקרוב.',
  'details.heldLabel': 'השעה השמורה עבורכם',
  'details.noHold.title': 'עדיין לא נשמרה שעה',
  'details.noHold.body': 'בחרו קודם שעה פנויה, ואנחנו נשמור אותה עבורכם עד להשלמת ההזמנה.',
  'details.back': 'חזרה לבחירת השעה',
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
