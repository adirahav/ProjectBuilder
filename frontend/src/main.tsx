import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './main.css'
import App from './App.tsx'
import { installLogger } from './utils/logger.ts'

// Must run before anything else logs, so tagged messages reach the in-app viewer.
installLogger()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
