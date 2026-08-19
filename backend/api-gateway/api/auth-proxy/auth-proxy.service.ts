import { config } from '../lib/config.ts'

export type LoginCredentials = {
  identifier: string
  password: string
}

export type UpstreamResult = {
  status: number
  body: unknown
}

export class UpstreamUnavailableError extends Error {}

// Forwards a login attempt to user-service, the only service that can check a
// password hash and sign a token. The gateway never inspects the password and
// never logs the body.
export async function forwardLogin(credentials: LoginCredentials): Promise<UpstreamResult> {
  let response: Response
  try {
    response = await fetch(`${config.userServiceUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Only the two contract fields are relayed — nothing else the client sent.
      body: JSON.stringify({
        identifier: credentials.identifier,
        password: credentials.password,
      }),
    })
  } catch {
    throw new UpstreamUnavailableError('Authentication service unavailable')
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new UpstreamUnavailableError('Authentication service unavailable')
  }

  return { status: response.status, body }
}
