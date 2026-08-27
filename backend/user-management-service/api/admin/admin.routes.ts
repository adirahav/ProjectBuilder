import { Router } from 'express'
import * as adminController from './admin.controller.js'

const router = Router()

// Public (`security: []` in the contract) — the frontend sends no
// Authorization header. The issued token carries `roles: ["user"]` only.
router.post('/signup', adminController.signup)

// NOT IMPLEMENTED in this ticket, by design:
//   POST  /api/auth/login        — ticket GATEWAYL-FE / plan 006
//   PATCH /api/admins/:id/roles  — F2b role promotion, separate ticket
// Both are explicitly out of scope in .plan/011. The JWT, error and Admin-model
// infrastructure they need is already in place here for them to reuse.

export const authRouter = router
