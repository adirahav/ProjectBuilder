/** Shared API-layer types used by http.service.ts and every domain service. */

/** The two independently deployed backend services. There is no gateway. */
export type ServiceName = 'tour-service' | 'user-management-service'

/** Error payload shape both services return on a non-2xx response. */
export type ApiErrorBody = {
  message?: string
  code?: string
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type RequestOptions = {
  /** Which backend service to route this request to. */
  service: ServiceName
  /** Query-string params. `undefined`/`null` values are omitted. */
  params?: Record<string, string | number | boolean | undefined | null>
  /** Set false for endpoints that must not carry the admin JWT (e.g. login). */
  withAuth?: boolean
  signal?: AbortSignal
}
