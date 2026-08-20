import { config } from '../lib/config.ts'

export type UpstreamResult = {
  status: number
  body: unknown
}

export class UpstreamUnavailableError extends Error {}

// Every Admin Service route resolves to a path under booking-service's
// /api/services router. The caller passes an already-validated path suffix —
// never raw, unescaped client input (see the uuid guard in the controller).
function bookingUrl(path: string): string {
  return `${config.bookingServiceUrl}/api/services${path}`
}

// Forwards an Admin Service request to booking-service, the owner of the
// `Service` collection. The gateway relays status + body and adds nothing:
// booking-service remains the single source of truth for the record.
//
// `internalAdminId` is the value verifyJwt derived from the verified token. It
// is passed explicitly rather than by copying the inbound headers, so a
// client-supplied `x-internal-admin` can never survive the hop.
export async function forwardServiceRequest(options: {
  method: 'GET' | 'POST' | 'PATCH'
  path: string
  internalAdminId: string
  body?: unknown
}): Promise<UpstreamResult> {
  const headers: Record<string, string> = {
    'x-internal-admin': options.internalAdminId,
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  let response: Response
  try {
    response = await fetch(bookingUrl(options.path), {
      method: options.method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch {
    throw new UpstreamUnavailableError('Booking service unavailable')
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new UpstreamUnavailableError('Booking service unavailable')
  }

  return { status: response.status, body }
}
