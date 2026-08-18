import { PawPrint } from 'lucide-react'
import { Link } from 'react-router-dom'

import { LanguageToggle } from '../common/LanguageToggle'
import { useI18n } from '../../hooks/useI18n'

/** App-wide header: brand mark (links home) plus the language switch. */
export function AppHeader() {
  const { t } = useI18n()

  return (
    <header className="border-b border-neutral-900/10 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-8">
        <Link
          to="/"
          className="flex items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary-light text-primary">
            <PawPrint className="size-5" aria-hidden="true" />
          </span>
          <span className="text-base font-bold text-neutral-900 md:text-lg">{t('brand.name')}</span>
        </Link>

        <LanguageToggle />
      </div>
    </header>
  )
}
