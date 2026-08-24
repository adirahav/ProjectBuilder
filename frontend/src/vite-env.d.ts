/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of tour-service (port 4001). */
  readonly VITE_TOUR_SERVICE_BASE_URL: string
  /** Base URL of user-management-service (port 4002). */
  readonly VITE_USER_SERVICE_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
