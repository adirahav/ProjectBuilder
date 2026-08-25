import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AdminPage } from './pages/AdminPage'
import { GatewayPage } from './pages/GatewayPage'
import { SignupPage } from './pages/SignupPage'
import { ToursPage } from './pages/ToursPage'

/**
 * Router shell. Feature tickets add their routes here using kebab-case paths
 * (see .rule/naming-rules.md).
 *
 * The single app-wide `sonner` toaster is mounted here — never render another
 * Toaster instance per page.
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Screen 1 — Gateway. Also where http.service.ts sends an expired session. */}
        <Route path="/" element={<GatewayPage />} />
        <Route path="/signup" element={<SignupPage />} />
        {/* Screens 3 and 4 — placeholders until their own tickets land. */}
        <Route path="/tours" element={<ToursPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster dir="rtl" position="top-center" richColors closeButton />
    </BrowserRouter>
  )
}
