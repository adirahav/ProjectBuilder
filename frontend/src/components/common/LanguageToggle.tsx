import { Languages } from 'lucide-react'

import { cn } from '../../lib/utils'
import { useI18n } from '../../hooks/useI18n'
import { LOCALES } from '../../i18n/strings'
import type { Locale } from '../../types/i18n.types'

const LOCALE_LABEL_KEY = {
  he: 'language.he',
  en: 'language.en',
} as const

/**
 * Segmented Hebrew/English switch. Each option is a real <button> with
 * `aria-pressed`, so screen readers announce which language is active rather
 * than relying on the highlight colour alone.
 */
export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n()

  return (
    <div
      role="group"
      aria-label={t('language.switchAria')}
      className="flex items-center gap-1 rounded-xl border border-neutral-900/10 bg-white p-1"
    >
      <Languages className="mx-1 size-4 shrink-0 text-neutral-900/50" aria-hidden="true" />

      {LOCALES.map((option: Locale) => {
        const isActive = option === locale

        return (
          <button
            key={option}
            type="button"
            lang={option}
            aria-pressed={isActive}
            onClick={() => setLocale(option)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
              isActive
                ? 'bg-primary text-white'
                : 'text-neutral-900/70 hover:bg-primary-light hover:text-neutral-900',
            )}
          >
            {t(LOCALE_LABEL_KEY[option])}
          </button>
        )
      })}
    </div>
  )
}
