---
name: jwt-middleware-layer
description: Use this skill when implementing JWT issuance in the auth-owning service, or JWT validation middleware in any service. Covers token shape, the shared-secret trust model, and the specific attack surface to guard against.
references:
  - @backend-service-layer/SKILL.md
  - @.rule/database-rules.md
  - @agents/security/CLAUDE.md
---

# JWT & Middleware Layer
*Goal:* One place issues the token; this project uses the gateway-centralized model, so only `api-gateway` validates it and downstream services trust the gateway. No service ever trusts the client for anything the token itself should prove. This skill exists separately because the trust model here is easy to get subtly wrong — get it wrong and a downstream service becomes reachable directly, bypassing the gateway's auth entirely.

## The Trust Model — Gateway-Centralized (this project's model)
- **Only `user-management-service` issues tokens** — via `POST /api/auth/login`, proxied through `api-gateway`. It's the only service with `jwt.ts`'s `sign` function.
- **Only `api-gateway` validates tokens.** `appointment-service`, `catalog-service`, and `user-management-service` never see the raw `Authorization` header and never call `jwt.verify` — they trust the `x-user-id`/`x-user-role` internal headers the gateway attaches after verifying.
- **Unauthenticated endpoints:** every customer-facing route (`GET /api/services`, `GET /api/time-slots`, `POST /api/appointments`) carries no token at all — there is no customer session to check. Do not add token issuance for `customer`; that role is never authenticated in this product, by design.

## Token Issuance (`user-management-service` only)

```typescript
// backend/user-management-service/src/lib/jwt.ts
import jwt from 'jsonwebtoken'

export interface AuthTokenPayload {
  userId: string
  email: string
  roles: string[] // always ['admin'] — single role in this product
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

## The Trust Model — Gateway-Centralized, in Detail
Only `api-gateway` ever sees or verifies the JWT. It verifies once per request, then forwards a trusted internal identity to whichever downstream service the request is proxied to. `appointment-service`, `catalog-service`, and `user-management-service` never see the `Authorization` header and never call `jwt.verify` themselves — they simply trust the internal header the gateway attached.

```
Client (web / native)
  │  Authorization: Bearer <jwt>
  ▼
api-gateway  ← verifies the JWT here, once
  │  x-user-id, x-user-role   (internal, trusted headers — NOT the original JWT)
  ├──► appointment-service
  ├──► catalog-service
  └──► user-management-service
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
    req.headers['x-user-id'] = decoded.userId
    req.headers['x-user-role'] = decoded.roles.join(',')
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

app.use(requireAuth)
app.use('/api/appointments', createProxyMiddleware({ target: process.env.APPOINTMENT_SERVICE_URL }))
app.use('/api/time-slots', createProxyMiddleware({ target: process.env.APPOINTMENT_SERVICE_URL }))
app.use('/api/services', createProxyMiddleware({ target: process.env.CATALOG_SERVICE_URL }))
app.use('/api/auth', createProxyMiddleware({ target: process.env.USER_SERVICE_URL }))
```
Note: `/api/services` and the `GET` side of `/api/time-slots` are customer-facing and public — `requireAuth` above only applies to the Admin-only management routes (service create/edit, time-slot create/block, appointment approve/cancel). Mount `requireAuth` per-route or per-router, not globally, so public customer routes stay unauthenticated.

```typescript
// Every downstream service — reads the trusted header, never verifies a JWT itself
app.use((req: AuthedRequest, res, next) => {
  const userId = req.headers['x-user-id']
  const role = req.headers['x-user-role']
  if (!userId) return res.status(401).json({ error: 'Missing internal identity header' })
  req.user = { userId: String(userId), roles: String(role || '').split(',').filter(Boolean) }
  next()
})
```

**This model has one hard requirement that per-service validation doesn't:** `appointment-service`, `catalog-service`, and `user-management-service` must be genuinely unreachable from outside `api-gateway` — no public port, no direct external route. If a downstream service *is* reachable directly, anyone can set `x-user-id`/`x-user-role` themselves and bypass auth entirely, since those services no longer verify anything. Enforce this at the deploy/network layer (private services, internal-only networking — e.g. Render's Private Service type, not Web Service, for everything except `api-gateway`), not just by convention. This is a hard production requirement for ClinicBook, not optional hardening — do not half-adopt gateway-centralized auth without the network isolation it depends on.

## The Shared-Secret Coordination Problem
Because independently-deployable services can update their signing secret independently, it's possible to update one's `JWT_SECRET` without the other — the failure mode is silent and confusing (every admin suddenly gets `401`s from `api-gateway` while `user-management-service` still issues fine).
- When rotating `JWT_SECRET`, update every service's environment config together, in the same deploy window.
- If zero-downtime secret rotation is ever needed, that requires a dual-secret validation window (accept old-or-new secret for a transition period) — not implemented by default; flag this explicitly if a real rotation need comes up rather than guessing at an approach.

## Security Notes (see `agents/security/CLAUDE.md`)
- **Algorithm confusion:** always pass an explicit `algorithms: ['HS256']` allowlist to `jwt.verify` — without it, some JWT libraries have historically accepted `alg: none` or let an attacker switch the algorithm, bypassing signature verification entirely. Pinning the algorithm on both sign and verify closes this.
- **Secret storage:** the JWT signing secret lives only in environment config, never in source code, never logged, never included in an error response even during debugging.
- **No password/secret in the payload:** confirmed above — payload is identity/role fields only.
- **Token in URL:** never accept or emit the token as a query parameter — only the `Authorization: Bearer <token>` header, on both the issuing and validating sides.

## Testing
- `verifyAuthToken`/`requireAuth` (in `api-gateway`) must be tested against: a valid token (passes), an expired token (`401`), a tampered signature (`401`), a token signed with a different secret (`401`), and a token with `alg: none` or an unexpected algorithm (`401`) — per `agents/security/CLAUDE.md`'s security test list.
- Test that each unauthenticated endpoint (`GET /api/services`, `GET /api/time-slots`, `POST /api/appointments`) succeeds with **no** `Authorization` header at all, to confirm it's genuinely public and no auth check accidentally crept onto that route.
- Test that `appointment-service`, `catalog-service`, and `user-management-service` reject (or at least never trust) a request carrying a self-set `x-user-id`/`x-user-role` header that arrived without going through `api-gateway`, if the deployment target makes that reachable at all during testing — and confirm downstream services are actually configured as network-private, not just relying on this middleware convention.

## Implementation Checklist
- [ ] `sign`/`verify` both pin `algorithms: ['HS256']` explicitly — never left to library defaults.
- [ ] The signing secret and expiry come from environment variables, identical value across all four services.
- [ ] Token payload contains no sensitive fields.
- [ ] `requireAuth` returns a generic `401` regardless of the specific validation failure reason.
- [ ] Every unauthenticated-by-design endpoint has no auth middleware attached; every Admin-only route does.
- [ ] No token is ever accepted via query string — header only.
- [ ] `api-gateway` strips the original `Authorization` header before proxying, and `appointment-service`/`catalog-service`/`user-management-service` are each deployed as network-private (unreachable except through the gateway) — not merely "trusted by convention."
