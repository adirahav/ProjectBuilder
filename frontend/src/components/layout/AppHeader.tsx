import { LogIn, LogOut, PawPrint } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { LanguageToggle } from '../common/LanguageToggle'
import { ADMIN_LOGIN_ROUTE } from '../ProtectedRoute'
import { useI18n } from '../../hooks/useI18n'
import { translate } from '../../i18n/strings'
import { useStore } from '../../store/store'
import { cn } from '../../lib/utils'

/** Shared by the Login link and the Logout button so the two swap in place
 * without the header row shifting. */
const AUTH_ACTION_CLASSES = cn(
  'inline-flex items-center gap-2 rounded-xl px-3 py-1.5',
  'text-sm font-semibold text-primary transition-colors hover:bg-primary-light',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
)

/**
 * App-wide header: brand mark (links home), the auth affordance, and the
 * language switch.
 *
 * The top safe-area inset keeps the brand row clear of the status bar and the
 * notch on the native build, where the WebView draws edge-to-edge. In a browser
 * `env(safe-area-inset-top)` resolves to 0, so the web layout is unchanged.
 *
 * The auth section renders nothing at all until `hydrateAuth()` has resolved.
 * The persisted token is read asynchronously, so during the first paint after a
 * refresh the store legitimately says "no token" — rendering on that would flash
 * "Log in" at an Admin who is in fact signed in (the same reason ProtectedRoute
 * waits on `isHydratingAuth`).
 */
export function AppHeader() {
  const { t } = useI18n()
  const navigate = useNavigate()

  const token = useStore((state) => state.token)
  const admin = useStore((state) => state.admin)
  const isHydratingAuth = useStore((state) => state.isHydratingAuth)
  const logout = useStore((state) => state.logout)

  const handleLogout = async () => {
    await logout()

    // Read the locale at completion time rather than closing over it, so
    // switching language mid-action cannot show a stale-language message.
    const { locale: activeLocale } = useStore.getState()
    toast.success(translate(activeLocale, 'header.logout.toast'))

    // Home, not the login page: the header is shared by every route, so an
    // Admin signing out of /admin/services landing on the public home is the
    // least surprising result — and Log in is right here when they return.
    navigate('/', { replace: true })
  }

  return (
    <header
      className={cn(
        'border-b border-neutral-900/10 bg-white',
        'pt-[env(safe-area-inset-top)]',
      )}
    >
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

        <div className="flex items-center gap-2 md:gap-3">
          {!isHydratingAuth &&
            (token ? (
              <div role="group" aria-label={t('header.authAria')} className="flex items-center gap-2">
                {admin?.email && (
                  <span
                    // Secondary information: useful confirmation of who is
                    // signed in, but never the only way to find Log out, so it
                    // is the first thing to go on a narrow screen.
                    className="hidden max-w-[14rem] truncate text-sm text-neutral-900/70 md:inline"
                  >
                    {t('header.signedInAs', { email: admin.email })}
                  </span>
                )}

                <button type="button" onClick={() => void handleLogout()} className={AUTH_ACTION_CLASSES}>
                  {/* The word carries the meaning; the icon only decorates it. */}
                  <LogOut className="size-4 shrink-0 rtl:-scale-x-100" aria-hidden="true" />
                  {t('header.logout')}
                </button>
              </div>
            ) : (
              <Link to={ADMIN_LOGIN_ROUTE} className={AUTH_ACTION_CLASSES}>
                <LogIn className="size-4 shrink-0 rtl:-scale-x-100" aria-hidden="true" />
                {t('header.login')}
              </Link>
            ))}

          <LanguageToggle />
        </div>
      </div>
    </header>
  )
}
