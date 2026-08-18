import { cn } from '../../lib/utils'
import { useI18n } from '../../hooks/useI18n'

/**
 * Keyboard-only escape hatch past the header. Visually hidden until focused,
 * at which point it pins itself to the start of the viewport — `start-4` keeps
 * it on the correct side in both RTL and LTR.
 */
export function SkipLink() {
  const { t } = useI18n()

  return (
    <a
      href="#main-content"
      className={cn(
        'sr-only focus:not-sr-only',
        'focus:absolute focus:top-4 focus:start-4 focus:z-50',
        'focus:rounded-xl focus:bg-primary focus:px-4 focus:py-2',
        'focus:text-sm focus:font-semibold focus:text-white',
        'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
      )}
    >
      {t('common.skipToContent')}
    </a>
  )
}
