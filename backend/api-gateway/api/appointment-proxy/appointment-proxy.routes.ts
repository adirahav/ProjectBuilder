import { Router } from 'express'

import {
  getAppointments,
  patchCancelAppointment,
  patchConfirmAppointment,
} from './appointment-proxy.controller.ts'

// PRD F9-F11 (Screen 7). Mounted at /api/appointments BEHIND verifyJwt in
// app.ts — the guard is applied at the mount point, not per-route, so any route
// later added to this router is gated by default rather than by remembering to.
//
// This is the most sensitive surface in the gateway: the list route aggregates
// customer PII across every booking in the clinic. It must have no
// unauthenticated path whatsoever.
//
// The public POST /api/appointments and GET /api/appointments/:id (F4/F4b) are
// deliberately NOT here: the frontend calls booking-service directly for them,
// so this router does not shadow them.
export const appointmentProxyRouter = Router()

// GET /api/appointments — F9, the Admin list with optional date/status filters.
appointmentProxyRouter.get('/', getAppointments)

// PATCH /api/appointments/:id/confirm — F10, pending -> confirmed.
appointmentProxyRouter.patch('/:id/confirm', patchConfirmAppointment)

// PATCH /api/appointments/:id/cancel — F11, pending|confirmed -> cancelled,
// releasing the linked TimeSlot back to open.
appointmentProxyRouter.patch('/:id/cancel', patchCancelAppointment)
