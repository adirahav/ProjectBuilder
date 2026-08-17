import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import HomePage from './pages/HomePage'

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-center" richColors dir="rtl" />
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>
    </BrowserRouter>
  )
}
