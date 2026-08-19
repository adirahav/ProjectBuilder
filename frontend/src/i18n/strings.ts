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
  'details.subtitle': 'Tell us how to reach you, and the time below is yours.',
  'details.heldLabel': 'Time held for you',
  'details.noHold.title': 'No time is held yet',
  'details.noHold.body': 'Choose an available time first, and we will hold it while you book.',
  'details.back': 'Back to time selection',

  'details.countdown.label': 'Time left to finish booking',
  'details.countdown.body': 'This time is held for you for another {time}.',
  'details.countdown.lastMinute': 'Less than a minute left to finish booking this time.',
  'details.countdown.expired': 'The hold on this time has run out.',

  'details.form.legend': 'Your contact details',
  'details.form.summary': 'Please correct the highlighted fields, then book again.',
  'details.form.required': 'Required',
  'details.form.optional': 'Optional',
  'details.form.errorPrefix': 'Error',
  'details.form.name.label': 'Full name',
  'details.form.name.placeholder': 'e.g. Dana Levi',
  'details.form.name.required': 'Please enter your name.',
  'details.form.name.tooShort': 'Please enter at least 2 characters.',
  'details.form.name.tooLong': 'Please use 60 characters or fewer.',
  'details.form.phone.label': 'Phone number',
  'details.form.phone.placeholder': 'e.g. 050-123-4567',
  'details.form.phone.hint': 'We only use it to reach you about this appointment.',
  'details.form.phone.required': 'Please enter a phone number.',
  'details.form.phone.invalid': 'Please enter a valid phone number, 9 to 15 digits.',
  'details.form.email.label': 'Email',
  'details.form.email.placeholder': 'e.g. dana@example.com',
  'details.form.email.hint': 'Add it and we will email your booking confirmation.',
  'details.form.email.invalid': 'Please enter a valid email address, or leave it empty.',

  'details.submit': 'Book this appointment',
  'details.submitting': 'Booking your appointment…',
  'details.success.toast': 'Your appointment is booked.',
  'details.error.toast': 'We could not book your appointment. Please try again.',
  'details.conflict.toast': 'The hold on this time ran out — please choose another time.',
  'details.expired.title': 'The hold on this time ran out',
  'details.expired.body':
    'We hold a time only briefly so it does not sit blocked for other customers. Nothing was booked — please choose a time again.',
  'details.expired.action': 'Choose another time',

  'appointment.status.pending': 'Awaiting confirmation',
  'appointment.status.confirmed': 'Confirmed',
  'appointment.status.cancelled': 'Cancelled',

  'confirmation.title': 'Your appointment is booked',
  'confirmation.subtitle': 'We have your details. The clinic will confirm your appointment shortly.',
  'confirmation.statusLabel': 'Booking status',
  'confirmation.referenceLabel': 'Booking reference',
  'confirmation.keepNotice': 'Keep this page — it is your receipt for this appointment.',
  'confirmation.loading': 'Loading your booking…',
  'confirmation.summaryLabel': 'Your booking summary',
  'confirmation.appointmentLabel': 'The appointment',
  'confirmation.serviceLabel': 'Treatment',
  'confirmation.timeLabel': 'Time',
  'confirmation.contactLabel': 'Your contact details',
  'confirmation.nameLabel': 'Name',
  'confirmation.phoneLabel': 'Phone',
  'confirmation.emailLabel': 'Email',
  'confirmation.notFound.title': 'We could not find that booking',
  'confirmation.notFound.body':
    'The link may be out of date, or the appointment may no longer exist. You can always book a new one from our services.',
  'confirmation.error.title': 'We could not load your booking',
  'confirmation.error.body': 'Check your internet connection and try again.',
  'confirmation.error.toast': 'Loading your booking failed. Please try again.',
  'confirmation.bookAnother': 'Book another appointment',
  'confirmation.back': 'Back to services',

  'adminLogin.title': 'Admin sign in',
  'adminLogin.subtitle': 'Sign in to manage services and appointments.',
  'adminLogin.form.legend': 'Admin credentials',
  'adminLogin.form.summary': 'Please complete the highlighted fields, then sign in again.',
  'adminLogin.form.identifier.label': 'Email or username',
  'adminLogin.form.identifier.placeholder': 'e.g. admin@example.com',
  'adminLogin.form.identifier.required': 'Please enter your email or username.',
  'adminLogin.form.password.label': 'Password',
  'adminLogin.form.password.required': 'Please enter your password.',
  'adminLogin.form.password.show': 'Show password',
  'adminLogin.form.password.hide': 'Hide password',
  'adminLogin.submit': 'Sign in',
  'adminLogin.submitting': 'Signing you in…',
  'adminLogin.invalid.title': 'Those credentials did not match',
  'adminLogin.invalid.body': 'Check the email or username and the password, then try again.',
  'adminLogin.error.title': 'We could not sign you in',
  'adminLogin.error.body': 'Check your internet connection and try again.',
  'adminLogin.error.toast': 'Signing in failed. Please try again.',
  'adminLogin.success.toast': 'Signed in.',
  'adminLogin.back': 'Back to the booking site',

  'admin.checkingSession': 'Checking your session…',
  'admin.dashboard.title': 'Admin dashboard',
  'admin.dashboard.subtitle': 'Managing services and appointments arrives with the next screens.',
  'admin.dashboard.placeholder.title': 'Nothing to manage here yet',
  'admin.dashboard.placeholder.body':
    'You are signed in. The services and appointments screens are still on their way.',
  'admin.signedInAs': 'Signed in as {email}',
  'admin.logout': 'Sign out',
  'admin.logout.toast': 'You are signed out.',
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
  'details.subtitle': 'ספרו לנו איך אפשר להשיג אתכם, והשעה שלמטה שלכם.',
  'details.heldLabel': 'השעה השמורה עבורכם',
  'details.noHold.title': 'עדיין לא נשמרה שעה',
  'details.noHold.body': 'בחרו קודם שעה פנויה, ואנחנו נשמור אותה עבורכם עד להשלמת ההזמנה.',
  'details.back': 'חזרה לבחירת השעה',

  'details.countdown.label': 'הזמן שנותר להשלמת ההזמנה',
  'details.countdown.body': 'השעה שמורה עבורכם לעוד {time}.',
  'details.countdown.lastMinute': 'נותרה פחות מדקה להשלמת ההזמנה של שעה זו.',
  'details.countdown.expired': 'השמירה על השעה הזו הסתיימה.',

  'details.form.legend': 'פרטי הקשר שלכם',
  'details.form.summary': 'אנא תקנו את השדות המסומנים ונסו להזמין שוב.',
  'details.form.required': 'שדה חובה',
  'details.form.optional': 'לא חובה',
  'details.form.errorPrefix': 'שגיאה',
  'details.form.name.label': 'שם מלא',
  'details.form.name.placeholder': 'לדוגמה: דנה לוי',
  'details.form.name.required': 'אנא הזינו את שמכם.',
  'details.form.name.tooShort': 'אנא הזינו לפחות 2 תווים.',
  'details.form.name.tooLong': 'אנא השתמשו ב־60 תווים לכל היותר.',
  'details.form.phone.label': 'מספר טלפון',
  'details.form.phone.placeholder': 'לדוגמה: 050-123-4567',
  'details.form.phone.hint': 'נשתמש בו רק כדי ליצור אתכם קשר בנוגע לתור הזה.',
  'details.form.phone.required': 'אנא הזינו מספר טלפון.',
  'details.form.phone.invalid': 'אנא הזינו מספר טלפון תקין, בין 9 ל־15 ספרות.',
  'details.form.email.label': 'דוא״ל',
  'details.form.email.placeholder': 'לדוגמה: dana@example.com',
  'details.form.email.hint': 'אם תוסיפו אותו, נשלח אליו את אישור ההזמנה.',
  'details.form.email.invalid': 'אנא הזינו כתובת דוא״ל תקינה, או השאירו את השדה ריק.',

  'details.submit': 'הזמנת התור',
  'details.submitting': 'מזמינים את התור…',
  'details.success.toast': 'התור שלכם הוזמן.',
  'details.error.toast': 'לא הצלחנו להזמין את התור. נסו שוב.',
  'details.conflict.toast': 'השמירה על השעה הסתיימה — בחרו שעה אחרת.',
  'details.expired.title': 'השמירה על השעה הסתיימה',
  'details.expired.body':
    'אנחנו שומרים שעה לזמן קצר בלבד כדי שלא תיחסם ללקוחות אחרים. שום דבר לא הוזמן — אנא בחרו שעה מחדש.',
  'details.expired.action': 'בחירת שעה אחרת',

  'appointment.status.pending': 'ממתין לאישור',
  'appointment.status.confirmed': 'מאושר',
  'appointment.status.cancelled': 'בוטל',

  'confirmation.title': 'התור שלכם הוזמן',
  'confirmation.subtitle': 'הפרטים שלכם התקבלו. המספרה תאשר את התור בקרוב.',
  'confirmation.statusLabel': 'סטטוס ההזמנה',
  'confirmation.referenceLabel': 'מספר ההזמנה',
  'confirmation.keepNotice': 'שמרו את הדף הזה — הוא האישור שלכם על התור.',
  'confirmation.loading': 'טוענים את פרטי ההזמנה…',
  'confirmation.summaryLabel': 'סיכום ההזמנה שלכם',
  'confirmation.appointmentLabel': 'פרטי התור',
  'confirmation.serviceLabel': 'הטיפול',
  'confirmation.timeLabel': 'שעה',
  'confirmation.contactLabel': 'פרטי הקשר שלכם',
  'confirmation.nameLabel': 'שם',
  'confirmation.phoneLabel': 'טלפון',
  'confirmation.emailLabel': 'דוא״ל',
  'confirmation.notFound.title': 'לא מצאנו את ההזמנה הזו',
  'confirmation.notFound.body':
    'ייתכן שהקישור אינו עדכני, או שהתור כבר לא קיים. תמיד אפשר להזמין תור חדש מרשימת השירותים.',
  'confirmation.error.title': 'לא הצלחנו לטעון את ההזמנה שלכם',
  'confirmation.error.body': 'בדקו את החיבור לאינטרנט ונסו שוב.',
  'confirmation.error.toast': 'טעינת ההזמנה נכשלה. נסו שוב.',
  'confirmation.bookAnother': 'הזמנת תור נוסף',
  'confirmation.back': 'חזרה לרשימת השירותים',

  'adminLogin.title': 'כניסת מנהל',
  'adminLogin.subtitle': 'התחברו כדי לנהל את השירותים והתורים.',
  'adminLogin.form.legend': 'פרטי הכניסה של המנהל',
  'adminLogin.form.summary': 'אנא מלאו את השדות המסומנים ונסו להתחבר שוב.',
  'adminLogin.form.identifier.label': 'דוא״ל או שם משתמש',
  'adminLogin.form.identifier.placeholder': 'לדוגמה: admin@example.com',
  'adminLogin.form.identifier.required': 'אנא הזינו דוא״ל או שם משתמש.',
  'adminLogin.form.password.label': 'סיסמה',
  'adminLogin.form.password.required': 'אנא הזינו סיסמה.',
  'adminLogin.form.password.show': 'הצגת הסיסמה',
  'adminLogin.form.password.hide': 'הסתרת הסיסמה',
  'adminLogin.submit': 'כניסה',
  'adminLogin.submitting': 'מתחברים…',
  'adminLogin.invalid.title': 'פרטי הכניסה אינם מתאימים',
  'adminLogin.invalid.body': 'בדקו את הדוא״ל או שם המשתמש ואת הסיסמה, ונסו שוב.',
  'adminLogin.error.title': 'לא הצלחנו לחבר אתכם',
  'adminLogin.error.body': 'בדקו את החיבור לאינטרנט ונסו שוב.',
  'adminLogin.error.toast': 'ההתחברות נכשלה. נסו שוב.',
  'adminLogin.success.toast': 'התחברתם בהצלחה.',
  'adminLogin.back': 'חזרה לאתר הזמנת התורים',

  'admin.checkingSession': 'בודקים את החיבור שלכם…',
  'admin.dashboard.title': 'ממשק הניהול',
  'admin.dashboard.subtitle': 'ניהול השירותים והתורים יגיע במסכים הבאים.',
  'admin.dashboard.placeholder.title': 'אין כאן עדיין מה לנהל',
  'admin.dashboard.placeholder.body':
    'אתם מחוברים. מסכי השירותים והתורים עדיין בדרך.',
  'admin.signedInAs': 'מחוברים בתור {email}',
  'admin.logout': 'יציאה',
  'admin.logout.toast': 'התנתקתם.',
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
