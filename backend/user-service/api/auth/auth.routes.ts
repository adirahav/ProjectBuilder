import { Router } from 'express'

import { loginAdmin, registerAdmin } from './auth.controller.ts'

// Wiring only — no logic lives in this file.
export const authRouter: Router = Router()

// Public by design: this is how the token is obtained in the first place, so
// no auth middleware may ever be attached here.
authRouter.post('/login', loginAdmin)

// PRD F12, Screen 8 — an already-signed-in Admin creates another Admin.
//
// SECURITY / READ BEFORE EDITING: `login` above is public and `register` is
// NOT. The gate lives in api-gateway, which mounts its proxy for THIS route
// (and not for login) behind `verifyJwt`, so an untokened request is answered
// 401 before it reaches this service. user-service adds no check of its own —
// same trust boundary as every other non-login route — which holds only while
// this service is unreachable from outside the internal network. There is no
// /signup and no public account-creation path anywhere in this system; the PRD
// names an open version of this route as a security regression to be rejected
// in review.
authRouter.post('/register', registerAdmin)
