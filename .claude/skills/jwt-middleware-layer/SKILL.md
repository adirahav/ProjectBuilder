---
name: jwt-middleware-layer
description: Use this skill when implementing JWT issuance in the auth-owning service, or JWT validation middleware in any service. Covers token shape, the shared-secret trust model, and the specific attack surface to guard against.
references:
  - @backend-service-layer/SKILL.md
  - @.rule/database-rules.md
  - @agents/security/CLAUDE.md
---

# JWT & Middleware Layer
*Goal:* One place issues the token; only the gateway validates it, and downstream services trust the gateway. No service ever trusts the client for anything the token itself should prove. This skill exists separately because the trust model here is easy to get subtly wrong — get it wrong and either protected routes become unguarded, or a downstream service becomes reachable directly, bypassing the gateway's auth entirely.

## Token Issuance (`user-service` only)

```typescript
// backend/user-service/api/lib/jwt.ts
import jwt from 'jsonwebtoken'

export interface AuthTokenPayload {
  userId: string
  role: 'admin' // single role in this system — the clinic owner
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    algorithm: 'HS256', // pin this explicitly — never let the caller/library negotiate the algorithm
  })
}
```

- Payload contains only the minimum needed to identify the admin — `userId` and `role: 'admin'`. Never include `passwordHash` or anything else a client shouldn't be able to decode and read (JWTs are signed, not encrypted; anyone can base64-decode the payload).
- **Trade-off to keep in mind:** because `role` is baked into the token at issuance, a permission change only takes effect the next time the admin logs in — there's no live revocation mid-session. Acceptable given the single-role, single-admin-per-clinic scale of this system.
- `expiresIn` comes from an environment variable, not hardcoded — set in `gateway` and `user-service`'s environment config (the only two services that ever touch a JWT).
- Only `user-service` ever calls `jwt.sign` — issued once, at `POST /api/auth/login`. `verifyAuthToken` is not needed in `user-service`; only `gateway` verifies (see below).

## The Trust Model — Gateway-Centralized (the only model this project uses)
Only the gateway ever sees or verifies the JWT. It verifies once per request, then forwards a trusted internal identity to whichever downstream service the request is proxied to. Downstream services never see the `Authorization` header and never call `jwt.verify` themselves — they simply trust the internal header the gateway attached.

```
Client
  │  Authorization: Bearer <jwt>
  ▼
Gateway  ← verifies the JWT here, once
  │  x-user-id, x-user-role   (internal, trusted headers — NOT the original JWT)
  ├──► appointment-service
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
    req.headers['x-user-id'] = decoded.userId
    req.headers['x-user-role'] = decoded.role
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

app.use(requireAuth)
app.use('/api', createProxyMiddleware({
  router: (req) => (req.path.startsWith('/api/auth') || req.path.startsWith('/api/admin')
    ? 'http://user-service:5002'
    : 'http://appointment-service:5001'),
}))
```

```typescript
// appointment-service and user-service — read the trusted header, never verify a JWT themselves
app.use((req: AuthedRequest, res, next) => {
  const userId = req.headers['x-user-id']
  const role = req.headers['x-user-role']
  // Only admin-only routes (service management, appointment confirm/cancel, admin dashboard list)
  // require this header to be present — public booking routes skip this middleware entirely.
  if (!userId) return res.status(401).json({ error: 'Missing internal identity header' })
  req.user = { userId: String(userId), role: String(role || '') }
  next()
})
```

**This model has one hard requirement:** `appointment-service` and `user-service` must be genuinely unreachable from outside the gateway — no public port, no direct external route. If either is reachable directly, anyone can set `x-user-id`/`x-user-role` themselves and bypass auth entirely, since neither service verifies anything itself. Enforce this at the deploy/network layer (private services, internal-only networking — e.g. Render's Private Service type, not Web Service, for `appointment-service` and `user-service`; only `gateway` is public), not just by convention.

## The Shared-Secret Coordination Problem
Only `gateway` and `user-service` ever need `JWT_SECRET` (the issuer and the verifier) — `appointment-service` never validates a token, so it doesn't need the secret at all. Because `gateway` and `user-service` are independently deployable, it's possible to update one's `JWT_SECRET` without the other — the failure mode is silent and confusing (every admin suddenly gets `401`s at the gateway while `user-service` would still issue tokens fine).
- When rotating `JWT_SECRET`, update `gateway` and `user-service`'s environment config together, in the same deploy window.
- If zero-downtime secret rotation is ever needed, that requires a dual-secret validation window (accept old-or-new secret for a transition period) — not implemented by default; flag this explicitly if a real rotation need comes up rather than guessing at an approach.

## Security Notes (see `agents/security/CLAUDE.md`)
- **Algorithm confusion:** always pass an explicit `algorithms: ['HS256']` allowlist to `jwt.verify` — without it, some JWT libraries have historically accepted `alg: none` or let an attacker switch the algorithm, bypassing signature verification entirely. Pinning the algorithm on both sign and verify closes this.
- **Secret storage:** the JWT signing secret lives only in environment config, never in source code, never logged, never included in an error response even during debugging.
- **No password/secret in the payload:** confirmed above — payload is identity/role fields only.
- **Token in URL:** never accept or emit the token as a query parameter — only the `Authorization: Bearer <token>` header, on both the issuing and validating sides.

## Testing
- The `gateway`'s `requireAuth` must be tested against: a valid admin token (passes), an expired token (`401`), a tampered signature (`401`), a token signed with a different secret (`401`), and a token with `alg: none` or an unexpected algorithm (`401`) — per `agents/security/CLAUDE.md`'s security test list.
- Test that every public booking-flow endpoint (`GET /api/services`, `GET /api/timeslots`, `POST /api/timeslots/:id/hold`, `POST /api/appointments`, `GET /api/appointments/:id`) succeeds with **no** `Authorization` header at all, to confirm it's genuinely public and no auth check accidentally crept onto that route.
- Test that `appointment-service`/`user-service` reject (or at least never trust) a request carrying a self-set `x-user-id`/`x-user-role` header that arrived without going through the gateway, if the deployment target makes that reachable at all during testing — and confirm both services are actually configured as network-private, not just relying on this middleware convention.

## Implementation Checklist
- [ ] `sign` (in `user-service`) and `verify` (in `gateway`) both pin `algorithms: ['HS256']` explicitly — never left to library defaults.
- [ ] The signing secret and expiry come from environment variables, identical value in `gateway` and `user-service`'s config.
- [ ] Token payload contains no sensitive fields (`userId`, `role` only).
- [ ] `requireAuth` (in `gateway`) returns a generic `401` regardless of the specific validation failure reason.
- [ ] Every public booking-flow endpoint has no auth middleware attached; every admin-only route does.
- [ ] No token is ever accepted via query string — header only.
- [ ] The gateway strips the original `Authorization` header before proxying, and `appointment-service`/`user-service` are both deployed as network-private (unreachable except through the gateway) — not merely "trusted by convention."
