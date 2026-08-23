---
name: jwt-middleware-layer
description: Use this skill when implementing JWT issuance in the auth-owning service, or JWT validation middleware in any service. Covers token shape, the shared-secret trust model, and the specific attack surface to guard against.
references:
  - @backend-service-layer/SKILL.md
  - @.rule/database-rules.md
  - @agents/security/CLAUDE.md
---

# JWT & Middleware Layer
*Goal:* One place issues the token — `user-management-service`, on login/signup — and every service that needs to authorize a request validates it locally, since there is no gateway in this project. No service ever trusts the client for anything the token itself should prove. This skill exists separately because the trust model here is easy to get subtly wrong — get it wrong and either protected routes become unguarded, or the signing secret drifts between `tour-service` and `user-management-service` and every admin gets logged out at random.

## The Trust Model — Per-Service Validation
Hila Tours has no gateway/reverse-proxy — the frontend calls `tour-service` and `user-management-service` directly by base URL, so each service must independently prove a token's validity. This is the only model that applies here (there is no gateway-centralized alternative to consider).

- **Only `user-management-service` issues tokens** — via `login`/`signup`. It's the only service with `jwt.ts`'s `sign` function.
- **Both `user-management-service` and `tour-service` validate tokens** locally, using the shared `JWT_SECRET` — no service calls another over the network just to check a token.
- **Unauthenticated endpoints:** the entire Passenger flow on `tour-service` — `GET /api/buses/:busId/seats` and `POST /api/seats/bookings` — carries no `Authorization` header at all; passengers have no account and are never issued a token. Do not add token issuance for passengers; that decision is explicit and out of scope, not half-implemented.

## Token Issuance (user-management-service only)

```typescript
// backend/user-management-service/api/lib/jwt.ts
import jwt from 'jsonwebtoken'

export interface AuthTokenPayload {
  adminId: string // admin's uuid (the client-facing `id`, never a raw Mongo _id)
  roles: string[] // e.g. ['admin'] or ['user'] — embedded so tour-service can authorize locally
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

- Payload contains only `adminId` and `roles` — the minimum needed to identify the admin and authorize them locally on `tour-service` without a cross-service call. Never include `passwordHash`, `email`, or anything else a client shouldn't be able to decode and read (JWTs are signed, not encrypted; anyone can base64-decode the payload).
- **Trade-off to keep in mind:** because `roles` is baked into the token at issuance, promoting an admin (`PATCH /api/admins/:id/roles`) only takes effect the next time that admin logs in — there's no live revocation mid-session. Acceptable given token lifetime; revisit if that becomes a problem.
- `expiresIn` comes from an environment variable (`JWT_EXPIRES_IN`), not hardcoded — set once per service's environment config, identical value across `tour-service` and `user-management-service`.

## Validation Middleware (both services)

```typescript
// auth.middleware.ts — present in both tour-service and user-management-service, identical logic, identical JWT_SECRET
import jwt from 'jsonwebtoken'
import { Request, Response, NextFunction } from 'express'

export interface AuthedRequest extends Request {
  user?: { adminId: string; roles: string[] }
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

export function requireAdminRole(req: AuthedRequest, res: Response, next: NextFunction) {
  // Mounted after requireAuth on every admin-mutating route (approve, cancel, toggle-reserve,
  // manual-assign, swap-move, tour/bus/busType CRUD, role promotion). A roles: ["user"]-only
  // account passes requireAuth (it has a valid session) but is rejected here.
  if (!req.user?.roles?.includes('admin')) {
    return res.status(403).json({ error: 'Admin role required' })
  }
  next()
}
```

- Every protected write route mounts `requireAuth`; admin-mutating routes additionally mount `requireAdminRole` right after it. The two Passenger endpoints listed above never mount either.
- The middleware never distinguishes *why* a token failed (expired vs. tampered vs. malformed) in its response body — all map to the same generic `401`, so a client can't use the error message to probe the validation logic.

## The Shared-Secret Coordination Problem
Because `tour-service` and `user-management-service` are independently-deployable, it's possible to update one's `JWT_SECRET` without the other — the failure mode is silent and confusing (every admin suddenly gets `401`s from one service while the other still logs them in fine).
- When rotating `JWT_SECRET`, update both services' environment config together, in the same deploy window.
- If zero-downtime secret rotation is ever needed, that requires a dual-secret validation window (accept old-or-new secret for a transition period) — not implemented by default; flag this explicitly if a real rotation need comes up rather than guessing at an approach.

## Security Notes (see `agents/security/CLAUDE.md`)
- **Algorithm confusion:** always pass an explicit `algorithms: ['HS256']` allowlist to `jwt.verify` — without it, some JWT libraries have historically accepted `alg: none` or let an attacker switch the algorithm, bypassing signature verification entirely. Pinning the algorithm on both sign and verify closes this.
- **Secret storage:** the JWT signing secret lives only in environment config, never in source code, never logged, never included in an error response even during debugging.
- **No password/secret in the payload:** confirmed above — payload is `adminId`/`roles` only.
- **Token in URL:** never accept or emit the token as a query parameter — only the `Authorization: Bearer <token>` header, on both the issuing and validating sides.

## Testing
- `verifyAuthToken`/`requireAuth` must be tested against: a valid token (passes), an expired token (`401`), a tampered signature (`401`), a token signed with a different secret (`401`), and a token with `alg: none` or an unexpected algorithm (`401`) — per `agents/security/CLAUDE.md`'s security test list.
- Test that each unauthenticated endpoint (`GET /api/buses/:busId/seats`, `POST /api/seats/bookings`) succeeds with **no** `Authorization` header at all, to confirm it's genuinely public and no auth check accidentally crept onto that route.
- Test `requireAdminRole` explicitly: a valid token with `roles: ["user"]` only must be rejected on every admin-mutating route (approve, cancel, toggle-reserve, manual-assign, swap-move, tour/bus/busType CRUD, role promotion), even though it passes `requireAuth`.

## Implementation Checklist
- [ ] `sign`/`verify` both pin `algorithms: ['HS256']` explicitly — never left to library defaults.
- [ ] The signing secret and expiry come from environment variables, identical value across `tour-service` and `user-management-service`.
- [ ] Token payload contains no sensitive fields (`adminId`, `roles` only).
- [ ] `requireAuth` returns a generic `401` regardless of the specific validation failure reason.
- [ ] `requireAdminRole` is mounted on every admin-mutating route, after `requireAuth`; the two Passenger endpoints have no auth middleware attached.
- [ ] No token is ever accepted via query string — header only.
