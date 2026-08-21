import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'

import { AppHeader } from './components/layout/AppHeader'
import { SkipLink } from './components/common/SkipLink'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ServiceListPage } from './pages/ServiceListPage'
import { TimeSlotPickerPage } from './pages/TimeSlotPickerPage'
import { CustomerDetailsPage } from './pages/CustomerDetailsPage'
import { BookingConfirmationPage } from './pages/BookingConfirmationPage'
import { AdminLoginPage } from './pages/AdminLoginPage'
import { AdminDashboardPage } from './pages/AdminDashboardPage'
import { AdminServicesPage } from './pages/AdminServicesPage'
import { AdminAppointmentsPage } from './pages/AdminAppointmentsPage'
import { AdminStaffAccountsPage } from './pages/AdminStaffAccountsPage'
import { useDocumentDirection } from './hooks/useI18n'
import { useNativeBackButton } from './native/useNativeBackButton'
import { useStore } from './store/store'
import { cn } from './lib/utils'
import { directionFor } from './store/slices/app.slice'
import { setUnauthorizedHandler } from './services/http.service'

/**
 * Routes plus the shared shell. Exported separately from `App` so tests can
 * mount it inside a MemoryRouter without a second router in the tree.
 *
 * The booking routes are public by design (a Customer has no account). `/admin`,
 * `/admin/services`, `/admin/appointments` and `/admin/staff` sit behind
 * ProtectedRoute; `/admin/login` stays public, since it is how the token is
 * obtained in the first place — and it is the *only* public auth route. Account
 * creation is not one: it lives at `/admin/staff`, inside the guard. That guard
 * is a convenience, not the security boundary — every Admin request is verified
 * again at api-gateway.
 */
export function AppRoutes() {
  const locale = useStore((state) => state.locale)
  const isHydratingLocale = useStore((state) => state.isHydratingLocale)
  const hydrateLocale = useStore((state) => state.hydrateLocale)
  const hydrateAuth = useStore((state) => state.hydrateAuth)
  const clearSession = useStore((state) => state.clearSession)

  // Reflect the active language on <html> so logical properties resolve.
  useDocumentDirection(locale)

  // The single app-wide native back-button listener. A no-op on web, and mounted
  // here because this is the one component that is both inside the router and
  // rendered exactly once (native-navigation-layer).
  useNativeBackButton()

  useEffect(() => {
    void hydrateLocale()
    void hydrateAuth()
  }, [hydrateLocale, hydrateAuth])

  // Lets http.service's global 401 handler drop the in-memory session without
  // importing the store, which would close an import cycle.
  useEffect(() => {
    setUnauthorizedHandler(clearSession)
    return () => setUnauthorizedHandler(null)
  }, [clearSession])

  // The persisted language is read from storage asynchronously (it is the
  // Capacitor Preferences API on the native build, not a synchronous
  // localStorage hit). Rendering copy before that read lands would paint the
  // Hebrew default and then visibly flip the whole page to English for anyone
  // who chose English last visit — direction, layout and every string at once.
  // An empty shell for one tick is a far smaller lie than the wrong language.
  if (isHydratingLocale) {
    return (
      <div
        className="relative min-h-screen w-full bg-neutral-50"
        aria-busy="true"
        aria-hidden="true"
      />
    )
  }

  return (
    /* The bottom inset clears the iOS home indicator / Android gesture bar on
       the native build. On web env() resolves to 0, so the padding costs
       nothing there. The top inset is AppHeader's job. */
    <div
      className={cn(
        'relative min-h-screen w-full overflow-x-hidden bg-neutral-50 text-neutral-900',
        'pb-[env(safe-area-inset-bottom)]',
      )}
    >
      <SkipLink />
      <AppHeader />

      <Routes>
        <Route path="/" element={<ServiceListPage />} />
        <Route path="/book/:serviceId" element={<TimeSlotPickerPage />} />
        <Route path="/book/:serviceId/details" element={<CustomerDetailsPage />} />
        {/* The id-bearing path is the real one: it is what lets a reload or a
            bookmark re-fetch the receipt. The id-less path stays mounted so an
            older link lands on the page's "we could not find that booking"
            explanation rather than being bounced silently to the home page. */}
        <Route
          path="/book/:serviceId/confirmation/:appointmentId"
          element={<BookingConfirmationPage />}
        />
        <Route path="/book/:serviceId/confirmation" element={<BookingConfirmationPage />} />

        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="/admin/services" element={<AdminServicesPage />} />
          <Route path="/admin/appointments" element={<AdminAppointmentsPage />} />
          {/* Creating an Admin account is an authenticated action, never a
              public sign-up. It lives under /admin/* and inside ProtectedRoute
              on purpose: there is deliberately no /signup or /register route in
              this app, and adding one would be a security regression the PRD
              calls out by name (F12). api-gateway enforces the same thing
              server-side, which is where it actually counts. */}
          <Route path="/admin/staff" element={<AdminStaffAccountsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

export default function App() {
  const locale = useStore((state) => state.locale)

  return (
    <BrowserRouter>
      <AppRoutes />
      {/* Single app-wide toaster — pages must never mount their own. */}
      <Toaster position="top-center" dir={directionFor(locale)} richColors closeButton />
    </BrowserRouter>
  )
}
