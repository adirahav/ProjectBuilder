---
name: jwt-middleware-layer
description: Use this skill when implementing JWT issuance in the auth-owning service, or JWT validation middleware in any service. Covers token shape, the shared-secret trust model, and the specific attack surface to guard against.
references:
  - @backend-service-layer/SKILL.md
  - @.rule/database-rules.md
  - @agents/security/CLAUDE.md
---

<!--
TEMPLATE — fill during project setup. Placeholders:
  {{ISSUING_SERVICE}}        — service that owns login/signup and signs tokens
  {{VALIDATING_SERVICES}}    — service(s) that validate the token (may be same as issuing service if a monolith)
  {{TOKEN_PAYLOAD_FIELDS}}   — minimal fields the token carries, e.g. userId, username, roles
  {{ROLES}}                  — role values, e.g. ['admin'], ['admin','user']
  {{UNAUTHENTICATED_ENDPOINTS}} — endpoints that intentionally take no Authorization header, if any
  {{MULTI_SERVICE_COORDINATION}} — include the shared-secret-rotation section only if there is more than one service
  {{AUTH_MODEL}} — "per-service" (every service validates the JWT itself, below) or "gateway-centralized"
    (only the gateway validates; downstream services trust its internal headers instead — see that section
    further down). Only relevant if this project has a gateway (Part 1 Q7); a monolith or a project without a
    gateway is always per-service. Delete whichever of the two model sections doesn't apply.
Ask the user: "Single service or multiple services validating tokens?" "If there's a gateway, should it be the
only service that verifies the JWT (gateway-centralized), or should every downstream service still verify it
independently even behind the gateway (per-service, more defense-in-depth but more duplicated logic)?" "What
roles/claims belong in the token?" "Any endpoints that must stay unauthenticated?"
-->

# JWT & Middleware Layer
*Goal:* One place issues the token; depending on `{{AUTH_MODEL}}`, either every service validates it locally, or only the gateway validates it and downstream services trust the gateway. Either way, no service ever trusts the client for anything the token itself should prove. This skill exists separately because the trust model here is easy to get subtly wrong — get it wrong and either protected routes become unguarded, the signing secret drifts between services and every user gets logged out at random, or (gateway-centralized model) a downstream service becomes reachable directly, bypassing the gateway's auth entirely.

## The Trust Model — Per-Service Validation (`{{AUTH_MODEL}}` = per-service)
- **Only `{{ISSUING_SERVICE}}` issues tokens** — via `login`/`signup`. It's the only service with `jwt.ts`'s `sign` function.
- **{{VALIDATING_SERVICES}} validate tokens** locally, using the shared secret — no service calls another over the network just to check a token.
- **Unauthenticated endpoints (if any):** {{UNAUTHENTICATED_ENDPOINTS}}. Do not add token issuance for a role that's intentionally never authenticated; keep that decision explicit and out of scope rather than half-implemented.

## Token Issuance ({{ISSUING_SERVICE}} only)

```typescript
// backend/<issuing-service>/src/lib/jwt.ts
import jwt from 'jsonwebtoken'

export interface AuthTokenPayload {
  {{TOKEN_PAYLOAD_FIELDS}}
  roles: string[] // e.g. {{ROLES}} — embedded so other services can authorize locally
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

## The Trust Model — Gateway-Centralized (`{{AUTH_MODEL}}` = gateway-centralized)
Only the gateway ever sees or verifies the JWT. It verifies once per request, then forwards a trusted internal identity to whichever downstream service the request is proxied to. Downstream services never see the `Authorization` header and never call `jwt.verify` themselves — they simply trust the internal header the gateway attached.

```
Client
  │  Authorization: Bearer <jwt>
  ▼
Gateway  ← verifies the JWT here, once
  │  x-user-id, x-user-role   (internal, trusted headers — NOT the original JWT)
  ├──► Service A
  ├──► Service B
  └──► Service C
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
app.use('/service-a', createProxyMiddleware({ target: 'http://service-a:PORT' }))
```

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

**This model has one hard requirement that per-service validation doesn't:** downstream services (`service-a`, `service-b`, ...) must be genuinely unreachable from outside the gateway — no public port, no direct external route. If a downstream service *is* reachable directly, anyone can set `x-user-id`/`x-user-role` themselves and bypass auth entirely, since those services no longer verify anything. Enforce this at the deploy/network layer (private services, internal-only networking — e.g. Render's Private Service type, not Web Service, for everything except the gateway), not just by convention. If downstream services cannot be made genuinely unreachable in this project's deployment target, use per-service validation instead — don't half-adopt gateway-centralized auth without the network isolation it depends on.

## The Shared-Secret Coordination Problem (fill in only if there are multiple services)
Because independently-deployable services can update their signing secret independently, it's possible to update one's `JWT_SECRET` without the other — the failure mode is silent and confusing (every user suddenly gets `401`s from one service while another still logs them in fine).
- When rotating `JWT_SECRET`, update every service's environment config together, in the same deploy window.
- If zero-downtime secret rotation is ever needed, that requires a dual-secret validation window (accept old-or-new secret for a transition period) — not implemented by default; flag this explicitly if a real rotation need comes up rather than guessing at an approach.

## Security Notes (see `agents/security/CLAUDE.md`)
- **Algorithm confusion:** always pass an explicit `algorithms: ['HS256']` allowlist to `jwt.verify` — without it, some JWT libraries have historically accepted `alg: none` or let an attacker switch the algorithm, bypassing signature verification entirely. Pinning the algorithm on both sign and verify closes this.
- **Secret storage:** the JWT signing secret lives only in environment config, never in source code, never logged, never included in an error response even during debugging.
- **No password/secret in the payload:** confirmed above — payload is identity/role fields only.
- **Token in URL:** never accept or emit the token as a query parameter — only the `Authorization: Bearer <token>` header, on both the issuing and validating sides.

## Testing
- `verifyAuthToken`/`requireAuth` must be tested against: a valid token (passes), an expired token (`401`), a tampered signature (`401`), a token signed with a different secret (`401`), and a token with `alg: none` or an unexpected algorithm (`401`) — per `agents/security/CLAUDE.md`'s security test list.
- Test that each unauthenticated endpoint succeeds with **no** `Authorization` header at all, to confirm it's genuinely public and no auth check accidentally crept onto that route.
- Gateway-centralized model only: test that a downstream service rejects (or at least never trusts) a request carrying a self-set `x-user-id`/`x-user-role` header that arrived without going through the gateway, if the deployment target makes that reachable at all during testing — and confirm downstream services are actually configured as network-private, not just relying on this middleware convention.

## Implementation Checklist
- [ ] `sign`/`verify` both pin `algorithms: ['HS256']` explicitly — never left to library defaults.
- [ ] The signing secret and expiry come from environment variables, identical value across all validating services.
- [ ] Token payload contains no sensitive fields.
- [ ] `requireAuth` returns a generic `401` regardless of the specific validation failure reason.
- [ ] Every unauthenticated-by-design endpoint has no auth middleware attached; every other protected route does.
- [ ] No token is ever accepted via query string — header only.
- [ ] Gateway-centralized model only: the gateway strips the original `Authorization` header before proxying, and every downstream service is deployed as network-private (unreachable except through the gateway) — not merely "trusted by convention."
