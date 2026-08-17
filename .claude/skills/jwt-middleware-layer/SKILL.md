---
name: jwt-middleware-layer
description: Use this skill when implementing JWT issuance in the auth-owning service, or JWT validation middleware in any service. Covers token shape, the shared-secret trust model, and the specific attack surface to guard against.
references:
  - @backend-service-layer/SKILL.md
  - @.rule/database-rules.md
  - @agents/security/CLAUDE.md
---

# JWT & Middleware Layer
*Goal:* One place issues the token, every service validates it locally, and neither trusts the client for anything the token itself should prove. This skill exists separately because the trust model here is easy to get subtly wrong — get it wrong and either protected routes become unguarded, or the signing secret drifts between services and every user gets logged out at random.

## The Trust Model
- **Only `admin-service` issues tokens** — via `login` (there is no signup; a single `Admin` account is seeded, per `.rule/database-rules.md`). It's the only service with `jwt.ts`'s `sign` function.
- **Both `admin-service` and `booking-service` validate tokens** locally, using the shared secret — no service calls another over the network just to check a token.
- **Unauthenticated endpoints:** every customer-facing route on `booking-service` (browse Services, browse TimeSlots, create Appointment) and `admin-service`'s `/api/auth/login` itself. `Customer` never authenticates — do not add token issuance for that role; it's an explicit, permanent product decision, not a gap.

## Token Issuance (`admin-service` only)

```typescript
// backend/admin-service/src/lib/jwt.ts
import jwt from 'jsonwebtoken'

export interface AuthTokenPayload {
  userId: string // Admin's uuid
  roles: string[] // ['admin'] — embedded so booking-service can authorize locally
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    algorithm: 'HS256', // pin this explicitly — never let the caller/library negotiate the algorithm
  })
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, process.env.JWT_SECRET!, {
    algorithms: ['HS256'], // reject anything else, including "none" — see Security Notes below
  }) as AuthTokenPayload
}
```

- Payload contains only the minimum needed to identify the user and authorize them locally without a cross-service call. Never include a password hash or anything else a client shouldn't be able to decode and read (JWTs are signed, not encrypted; anyone can base64-decode the payload).
- **Trade-off to keep in mind:** because `roles` is baked into the token at issuance, a role change only takes effect the next time that user logs in — there's no live revocation mid-session. Acceptable if token lifetime is short; revisit if that becomes a problem.
- `expiresIn` comes from an environment variable, not hardcoded — set once per service's environment config, identical value across all services that validate.

## Validation Middleware (every validating service)

```typescript
// auth.middleware.ts — present in every validating service, identical logic, identical JWT_SECRET
import jwt from 'jsonwebtoken'
import { Request, Response, NextFunction } from 'express'

export interface AuthedRequest extends Request {
  user?: { userId: string; roles: string[] }
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization

  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' })
  }

  const token = header.slice(7)

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] })
    req.user = decoded as AuthedRequest['user']
    next()
  } catch (err) {
    // Covers: expired (TokenExpiredError), tampered signature (JsonWebTokenError), malformed token
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}
```

- Every protected write route mounts this middleware; the unauthenticated endpoints listed above never do.
- The middleware never distinguishes *why* a token failed (expired vs. tampered vs. malformed) in its response body — all map to the same generic `401`, so a client can't use the error message to probe the validation logic.

## The Shared-Secret Coordination Problem
Because `booking-service` and `admin-service` are independently-deployable, it's possible to update one's `JWT_SECRET` without the other — the failure mode is silent and confusing (every admin request suddenly gets `401`s from `booking-service` while `admin-service` still logs them in fine).
- When rotating `JWT_SECRET`, update both services' environment config together, in the same deploy window.
- If zero-downtime secret rotation is ever needed, that requires a dual-secret validation window (accept old-or-new secret for a transition period) — not implemented by default; flag this explicitly if a real rotation need comes up rather than guessing at an approach.

## Security Notes (see `agents/security/CLAUDE.md`)
- **Algorithm confusion:** always pass an explicit `algorithms: ['HS256']` allowlist to `jwt.verify` — without it, some JWT libraries have historically accepted `alg: none` or let an attacker switch the algorithm, bypassing signature verification entirely. Pinning the algorithm on both sign and verify closes this.
- **Secret storage:** the JWT signing secret lives only in environment config, never in source code, never logged, never included in an error response even during debugging.
- **No password/secret in the payload:** confirmed above — payload is identity/role fields only.
- **Token in URL:** never accept or emit the token as a query parameter — only the `Authorization: Bearer <token>` header, on both the issuing and validating sides.

## Testing
- `verifyAuthToken`/`requireAuth` must be tested against: a valid token (passes), an expired token (`401`), a tampered signature (`401`), a token signed with a different secret (`401`), and a token with `alg: none` or an unexpected algorithm (`401`) — per `agents/security/CLAUDE.md`'s security test list.
- Test that each unauthenticated endpoint succeeds with **no** `Authorization` header at all, to confirm it's genuinely public and no auth check accidentally crept onto that route.

## Implementation Checklist
- [ ] `sign`/`verify` both pin `algorithms: ['HS256']` explicitly — never left to library defaults.
- [ ] The signing secret and expiry come from environment variables, identical value across all validating services.
- [ ] Token payload contains no sensitive fields.
- [ ] `requireAuth` returns a generic `401` regardless of the specific validation failure reason.
- [ ] Every unauthenticated-by-design endpoint has no auth middleware attached; every other protected route does.
- [ ] No token is ever accepted via query string — header only.
