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
import { useDocumentDirection } from './hooks/useI18n'
import { useStore } from './store/store'
import { directionFor } from './store/slices/app.slice'
import { setUnauthorizedHandler } from './services/http.service'

/**
 * Routes plus the shared shell. Exported separately from `App` so tests can
 * mount it inside a MemoryRouter without a second router in the tree.
 *
 * The booking routes are public by design (a Customer has no account). `/admin`
 * and `/admin/services` sit behind ProtectedRoute; `/admin/login` stays public,
 * since it is how the token is obtained in the first place. The Appointments
 * view lands with its own ticket, underneath the same guard.
 */
export function AppRoutes() {
  const locale = useStore((state) => state.locale)
  const hydrateLocale = useStore((state) => state.hydrateLocale)
  const hydrateAuth = useStore((state) => state.hydrateAuth)
  const clearSession = useStore((state) => state.clearSession)

  // Reflect the active language on <html> so logical properties resolve.
  useDocumentDirection(locale)

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

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-neutral-50 text-neutral-900">
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
