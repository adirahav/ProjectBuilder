import { Router } from 'express'

import {
  getAppointment,
  getAppointments,
  patchCancelAppointment,
  patchConfirmAppointment,
  postAppointment,
} from './appointment.controller.ts'

// Route wiring only — no logic here.
export const appointmentRouter: Router = Router()

// Public, unauthenticated (PRD F4).
appointmentRouter.post('/', postAppointment)

// Admin routes (PRD F9-F11). No auth middleware here on purpose: booking-service
// is internal and trusts api-gateway to have verified the Admin JWT before
// forwarding — the same boundary the Admin Service writes (F6-F8) use.
//
// The Admin list is `GET /` and the Customer receipt is `GET /:id`, so the two
// cannot shadow each other: an empty path segment never matches `/:id`.
appointmentRouter.get('/', getAppointments)
appointmentRouter.patch('/:id/confirm', patchConfirmAppointment)
appointmentRouter.patch('/:id/cancel', patchCancelAppointment)

// The Customer's receipt (PRD Screen 4). Read-only — no mutation on this path.
// Declared last so the more specific routes above always win.
appointmentRouter.get('/:id', getAppointment)
