import { ADMIN_HOME_ROUTE, ADMIN_LOGIN_ROUTE } from '../components/ProtectedRoute'

/**
 * The public Service List. It is the Customer's navigation root and also the
 * screen the Admin falls back to from the login page, so it is never a
 * `navigate(-1)` target — it is where back-navigation stops.
 */
export const PUBLIC_HOME_ROUTE = '/'

/**
 * How long the "press back again to exit" offer stays open. Two seconds is the
 * Android convention: long enough to be a deliberate second press, short enough
 * that a press a minute later is obviously a fresh intent and not a stale one.
 */
export const EXIT_PROMPT_WINDOW_MS = 2_000

/** What the native back-button press should do, decided from state alone. */
export type BackButtonAction =
  /** A modal is open: close it and leave the page underneath untouched. */
  | { type: 'closeModal' }
  /** Root screen, first press: warn before anything irreversible happens. */
  | { type: 'promptExit' }
  /** Root screen, second press inside the window: send the app to the background. */
  | { type: 'exitApp' }
  /** Not a root screen: step back one entry through history. */
  | { type: 'navigateBack' }
  /** Back leads somewhere specific rather than "wherever we came from". */
  | { type: 'navigateTo'; path: string }

export interface BackButtonContext {
  /** The route the user is looking at right now, not when the listener was set up. */
  pathname: string
  /** Whether an Admin session is live. Derived from the store's token. */
  isAuthenticated: boolean
  /** Whether any ModalDialog is currently mounted and open. */
  isModalOpen: boolean
  /** When the exit prompt was last shown, or null if it never was / was reset. */
  lastExitPromptAt: number | null
  /** Current time, injected so the two-second window is testable without fake timers. */
  now: number
}

/** The Admin screens that sit behind ProtectedRoute. */
const PROTECTED_ADMIN_ROUTES = [ADMIN_HOME_ROUTE, '/admin/services', '/admin/appointments']

function isProtectedAdminRoute(pathname: string): boolean {
  return PROTECTED_ADMIN_ROUTES.includes(normalize(pathname))
}

/** Trailing slashes come from deep links and would otherwise miss every match. */
function normalize(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1)
  return pathname
}

/**
 * A navigation root: the screen where "back" has nowhere left to go and must
 * offer to leave the app instead of popping history (native-navigation-layer
 * §1). There are two, one per role — `/` for the Customer and `/admin` for a
 * signed-in Admin. `/admin` only counts while the session is live: without a
 * token, ProtectedRoute is already bouncing the user to the login page, so
 * treating it as a root would offer to exit the app from a screen that is not
 * even on screen.
 */
export function isRootRoute(pathname: string, isAuthenticated: boolean): boolean {
  const path = normalize(pathname)
  if (path === PUBLIC_HOME_ROUTE) return true
  return path === ADMIN_HOME_ROUTE && isAuthenticated
}

/**
 * The whole native back-button decision table, as one pure function.
 *
 * Kept free of Capacitor, React and the router on purpose: the actual
 * `backButton` event only ever fires inside a real Android/iOS runtime, so if
 * the rules lived in the listener they could not be tested at all. Here every
 * branch is a plain input/output case (see backButtonLogic.test.ts), and the
 * hook around it stays a thin wire.
 *
 * Precedence matters and is deliberate:
 *
 * 1. An open modal always wins. It is the topmost thing on screen, so it is
 *    what "back" means, whatever route sits behind it (§2).
 * 2. `/admin/login` goes to `/`, never back into history. History there may
 *    hold the protected route the guard just turned the Admin away from, and
 *    stepping into it would bounce straight back to the login page (§4).
 * 3. A protected Admin route without a token is read as the login page for the
 *    same reason: the guard's redirect is already in flight, and the honest
 *    answer to "where does back go from here" is the public home page.
 * 4. Root screens run the double-press exit sequence (§3).
 * 5. Everything else — the booking flow, `/admin/services`, `/admin/appointments`
 *    — is linear history and steps back one level (§1).
 *
 * Note that no branch returns "do nothing": a press that produces no visible
 * response reads as a frozen app (§3, the "Do Nothing" prohibition).
 */
export function decideBackButtonAction(context: BackButtonContext): BackButtonAction {
  const { pathname, isAuthenticated, isModalOpen, lastExitPromptAt, now } = context

  if (isModalOpen) return { type: 'closeModal' }

  const path = normalize(pathname)

  if (path === ADMIN_LOGIN_ROUTE) return { type: 'navigateTo', path: PUBLIC_HOME_ROUTE }
  if (isProtectedAdminRoute(path) && !isAuthenticated) {
    return { type: 'navigateTo', path: PUBLIC_HOME_ROUTE }
  }

  if (isRootRoute(path, isAuthenticated)) {
    const isWithinWindow =
      lastExitPromptAt !== null && now - lastExitPromptAt <= EXIT_PROMPT_WINDOW_MS
    // A press after the window has closed re-arms the prompt rather than
    // exiting: the user has long since stopped thinking about the first press.
    return isWithinWindow ? { type: 'exitApp' } : { type: 'promptExit' }
  }

  return { type: 'navigateBack' }
}
