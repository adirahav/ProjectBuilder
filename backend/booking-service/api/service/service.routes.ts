import { Router } from 'express'

import {
  getAllServices,
  getServices,
  patchDeactivateService,
  patchService,
  postService,
} from './service.controller.ts'

// Route wiring only — no logic here.
export const serviceRouter: Router = Router()

// Public, unauthenticated (PRD F1).
serviceRouter.get('/', getServices)

// Admin routes (PRD F6-F8). No auth middleware here on purpose: booking-service
// is internal and trusts api-gateway to have verified the Admin JWT before
// forwarding (plan 011's `verifyJwt` + `x-internal-admin` trust boundary).
// `/all` is declared before any `/:id` route so it can never be captured as an
// id.
serviceRouter.get('/all', getAllServices)
serviceRouter.post('/', postService)
serviceRouter.patch('/:id/deactivate', patchDeactivateService)
serviceRouter.patch('/:id', patchService)
