---
name: jwt-middleware-layer
description: Use this skill when implementing JWT issuance in the auth-owning service, or JWT validation middleware in any service. Covers token shape, the shared-secret trust model, and the specific attack surface to guard against.
references:
  - @backend-service-layer/SKILL.md
  - @.rule/database-rules.md
  - @agents/security/CLAUDE.md
---

# JWT & Middleware Layer
*Goal:* Only `api-gateway` issues and verifies the token; downstream services (`booking-service`, `user-service`) trust the gateway's internal headers instead of verifying tokens themselves. No service ever trusts the client for anything the token itself should prove. This skill exists separately because the trust model here is easy to get subtly wrong — get it wrong and either protected routes become unguarded, or a downstream service becomes reachable directly, bypassing the gateway's auth entirely.

## The Trust Model — Gateway-Centralized (this project's model)
- **Only `user-service` issues tokens** — via `login`. It's the only service with `jwt.ts`'s `sign` function.
- **Only `api-gateway` verifies tokens.** `booking-service` and `user-service` never see the raw JWT and never call `jwt.verify` themselves.
- **Unauthenticated endpoints:** `GET /api/services`, `GET /api/time-slots`, `POST /api/time-slots/:id/hold`, `POST /api/appointments`, `POST /api/auth/login`. No token issuance exists for `Customer` — that role is intentionally never authenticated.

## Token Issuance (`user-service` only)

```typescript
// backend/user-service/api/lib/jwt.ts
import jwt from 'jsonwebtoken'

export interface AuthTokenPayload {
  userId: string
  roles: string[] // ['admin']
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    algorithm: 'HS256', // pin this explicitly — never let the caller/library negotiate the algorithm
  })
}
```

- Payload contains only the minimum needed to identify the Admin. Never include the password hash or anything else a client shouldn't be able to decode and read (JWTs are signed, not encrypted; anyone can base64-decode the payload).
- **Trade-off to keep in mind:** because `roles` is baked into the token at issuance, a role change only takes effect the next time that Admin logs in — there's no live revocation mid-session. Acceptable given there's a single Admin account and short token lifetime.
- `expiresIn` comes from an environment variable, not hardcoded.

## The Trust Model — Gateway-Centralized, in Detail
Only the gateway ever sees or verifies the JWT. It verifies once per request, then forwards a trusted internal identity to whichever downstream service the request is proxied to. Downstream services never see the `Authorization` header and never call `jwt.verify` themselves — they simply trust the internal header the gateway attached.

```
Client (Admin dashboard)
  │  Authorization: Bearer <jwt>
  ▼
api-gateway  ← verifies the JWT here, once
  │  x-internal-admin: true   (internal, trusted header — NOT the original JWT)
  ├──► booking-service
  └──► user-service
```

```typescript
// Gateway — the only place that ever calls jwt.verify
import jwt from 'jsonwebtoken'
import { createProxyMiddleware } from 'http-proxy-middleware'

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' })
  }
  try {
    const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET!, { algorithms: ['HS256'] }) as AuthTokenPayload
    // Strip the original Authorization header before forwarding — downstream
    // services must never receive the raw token, only the derived identity.
    delete req.headers.authorization
    req.headers['x-internal-admin'] = 'true'
    req.headers['x-user-id'] = decoded.userId
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

app.use('/api/services', publicOrAdminRoutesProxy)   // GET is public; write methods require requireAuth upstream
app.use('/api/appointments', requireAuth, createProxyMiddleware({ target: process.env.BOOKING_SERVICE_URL }))
app.use('/api/auth', createProxyMiddleware({ target: process.env.USER_SERVICE_URL })) // login itself is public
```

```typescript
// booking-service / user-service — reads the trusted header, never verifies a JWT itself
app.use((req: AuthedRequest, res, next) => {
  const isAdmin = req.headers['x-internal-admin'] === 'true'
  req.user = isAdmin ? { userId: String(req.headers['x-user-id'] || ''), roles: ['admin'] } : undefined
  next()
})

function requireInternalAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Missing internal identity header' })
  next()
}
```

**This model has one hard requirement that per-service validation doesn't:** `booking-service` and `user-service` must be genuinely unreachable from outside `api-gateway` — no public port, no direct external route. If a downstream service *is* reachable directly, anyone can set `x-internal-admin: true` themselves and bypass auth entirely, since those services no longer verify anything. Enforce this at the deploy/network layer (private services, internal-only networking), not just by convention.

## The Shared-Secret Coordination Problem
`JWT_SECRET` only needs to exist on `api-gateway` and `user-service` (the only two services that ever sign or verify a token) — `booking-service` never sees it. When rotating `JWT_SECRET`, update both together, in the same deploy window. If zero-downtime secret rotation is ever needed, that requires a dual-secret validation window (accept old-or-new secret for a transition period) — not implemented by default; flag this explicitly if a real rotation need comes up rather than guessing at an approach.

## Security Notes (see `agents/security/CLAUDE.md`)
- **Algorithm confusion:** always pass an explicit `algorithms: ['HS256']` allowlist to `jwt.verify` — without it, some JWT libraries have historically accepted `alg: none` or let an attacker switch the algorithm, bypassing signature verification entirely. Pinning the algorithm on both sign and verify closes this.
- **Secret storage:** the JWT signing secret lives only in environment config, never in source code, never logged, never included in an error response even during debugging.
- **No password/secret in the payload:** confirmed above — payload is identity/role fields only.
- **Token in URL:** never accept or emit the token as a query parameter — only the `Authorization: Bearer <token>` header, on both the issuing and validating sides.

## Testing
- `signAuthToken`/`requireAuth` (gateway) must be tested against: a valid token (passes), an expired token (`401`), a tampered signature (`401`), a token signed with a different secret (`401`), and a token with `alg: none` or an unexpected algorithm (`401`) — per `agents/security/CLAUDE.md`'s security test list.
- Test that each unauthenticated endpoint succeeds with **no** `Authorization` header at all, to confirm it's genuinely public and no auth check accidentally crept onto that route.
- Test that `booking-service`/`user-service` reject (or at least never trust) a request carrying a self-set `x-internal-admin` header that arrived without going through the gateway, if the deployment target makes that reachable at all during testing — and confirm downstream services are actually configured as network-private, not just relying on this middleware convention.

## Implementation Checklist
- [ ] `sign`/`verify` both pin `algorithms: ['HS256']` explicitly — never left to library defaults.
- [ ] The signing secret and expiry come from environment variables, identical value across `api-gateway` and `user-service`.
- [ ] Token payload contains no sensitive fields.
- [ ] `requireAuth` returns a generic `401` regardless of the specific validation failure reason.
- [ ] Every unauthenticated-by-design endpoint has no auth middleware attached; every other protected route does.
- [ ] No token is ever accepted via query string — header only.
- [ ] `api-gateway` strips the original `Authorization` header before proxying, and `booking-service`/`user-service` are deployed as network-private (unreachable except through the gateway) — not merely "trusted by convention."
