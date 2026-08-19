import { Router } from 'express'

import { loginAdmin } from './auth-proxy.controller.ts'

export const authProxyRouter = Router()

// POST /api/auth/login — unauthenticated by design: it is how the JWT is obtained.
authProxyRouter.post('/login', loginAdmin)
