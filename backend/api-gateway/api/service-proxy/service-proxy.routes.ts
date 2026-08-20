import { Router } from 'express'

import {
  getAllServices,
  patchDeactivateService,
  patchService,
  postService,
} from './service-proxy.controller.ts'

// PRD F6-F8 (Screen 6). Mounted at /api/services BEHIND verifyJwt in app.ts —
// the guard is applied at the mount point, not per-route, so any route later
// added to this router is gated by default rather than by remembering to.
//
// The public, unauthenticated GET /api/services is deliberately NOT here: the
// frontend calls booking-service directly for it and it must keep returning
// active services only.
export const serviceProxyRouter = Router()

// GET /api/services/all — declared before the /:id routes so the literal path
// can never be captured as an id.
serviceProxyRouter.get('/all', getAllServices)

// POST /api/services — F6, create.
serviceProxyRouter.post('/', postService)

// PATCH /api/services/:id/deactivate — F8, soft delete. Registered before the
// bare /:id patch to keep the more specific path unambiguous.
serviceProxyRouter.patch('/:id/deactivate', patchDeactivateService)

// PATCH /api/services/:id — F7, partial update.
serviceProxyRouter.patch('/:id', patchService)
