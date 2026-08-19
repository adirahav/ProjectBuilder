import { Router } from 'express'

import { loginAdmin } from './auth.controller.ts'

// Wiring only — no logic lives in this file.
export const authRouter: Router = Router()

// Public by design: this is how the token is obtained in the first place, so
// no auth middleware may ever be attached here.
authRouter.post('/login', loginAdmin)
