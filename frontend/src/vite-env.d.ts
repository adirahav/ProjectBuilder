/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BOOKING_SERVICE_URL: string
  readonly VITE_ADMIN_SERVICE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
