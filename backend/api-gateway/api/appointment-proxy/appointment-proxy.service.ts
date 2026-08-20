import { config } from '../lib/config.ts'

export type UpstreamResult = {
  status: number
  body: unknown
}

export class UpstreamUnavailableError extends Error {}

// Every Admin Appointment route resolves to a path under booking-service's
// /api/appointments router. The caller passes an already-validated path suffix
// and an already-validated query string — never raw, unescaped client input
// (see the uuid guard and the filter validators in the controller).
function bookingUrl(path: string, query?: URLSearchParams): string {
  const suffix = query && [...query.keys()].length > 0 ? `?${query.toString()}` : ''
  return `${config.bookingServiceUrl}/api/appointments${path}${suffix}`
}

// Forwards an Admin Appointment request to booking-service, the owner of the
// `Appointment` collection. The gateway relays status + body and adds nothing:
// booking-service remains the single source of truth for the record, and the
// TimeSlot release on cancel is booking-service's job, never a second call
// from here.
//
// `internalAdminId` is the value verifyJwt derived from the verified token. It
// is passed explicitly rather than by copying the inbound headers, so a
// client-supplied `x-internal-admin` can never survive the hop.
export async function forwardAppointmentRequest(options: {
  method: 'GET' | 'PATCH'
  path: string
  internalAdminId: string
  query?: URLSearchParams
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
    response = await fetch(bookingUrl(options.path, options.query), {
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
