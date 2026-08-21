import { Router } from 'express'

import { verifyJwt } from '../routing/routing.middleware.ts'
import { loginAdmin, registerAdmin } from './auth-proxy.controller.ts'

export const authProxyRouter = Router()

// ---------------------------------------------------------------------------
// THE /api/auth SPLIT — read both routes together before editing either.
//
// This router is mounted in app.ts WITHOUT a mount-point guard, unlike every
// other Admin mount, because its two routes have deliberately OPPOSITE auth
// requirements. The guard is therefore applied per-route, right here:
//
//   POST /login    — PUBLIC. It is how a JWT is obtained in the first place;
//                    gating it would lock every Admin out permanently.
//   POST /register — GATED by verifyJwt. PRD F12: an existing, signed-in Admin
//                    creates the next Admin's account from inside the
//                    dashboard. There is no self-service sign-up in this
//                    product, no /signup, and no unauthenticated path to
//                    account creation anywhere. An open version of this route
//                    is named in the PRD as a security regression to be
//                    rejected in review — it would let anyone on the internet
//                    mint a full Admin account.
//
// Do NOT move the guard to the mount point (it would break login) and do NOT
// drop it from register (it would open registration). Any route added to this
// router later must state which side of this split it is on.
// ---------------------------------------------------------------------------

authProxyRouter.post('/login', loginAdmin)

authProxyRouter.post('/register', verifyJwt, registerAdmin)
