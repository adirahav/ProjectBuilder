import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'

import { AppHeader } from './components/layout/AppHeader'
import { SkipLink } from './components/common/SkipLink'
import { ServiceListPage } from './pages/ServiceListPage'
import { TimeSlotPickerPage } from './pages/TimeSlotPickerPage'
import { CustomerDetailsPage } from './pages/CustomerDetailsPage'
import { BookingConfirmationPage } from './pages/BookingConfirmationPage'
import { useDocumentDirection } from './hooks/useI18n'
import { useStore } from './store/store'
import { directionFor } from './store/slices/app.slice'

/**
 * Routes plus the shared shell. Exported separately from `App` so tests can
 * mount it inside a MemoryRouter without a second router in the tree.
 *
 * Every route here is public — the PRD's Admin routes (`/admin`,
 * `/admin/appointments`, `/admin/login`) land with the Admin tickets, together
 * with the ProtectedRoute guard they need.
 */
export function AppRoutes() {
  const locale = useStore((state) => state.locale)
  const hydrateLocale = useStore((state) => state.hydrateLocale)

  // Reflect the active language on <html> so logical properties resolve.
  useDocumentDirection(locale)

  useEffect(() => {
    void hydrateLocale()
  }, [hydrateLocale])

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
