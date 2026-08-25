import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { HomePage } from './pages/HomePage'
import { SignupPage } from './pages/SignupPage'

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
        <Route path="/" element={<HomePage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster dir="rtl" position="top-center" richColors closeButton />
    </BrowserRouter>
  )
}
