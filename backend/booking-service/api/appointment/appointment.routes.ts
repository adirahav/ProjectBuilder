import { Router } from 'express'

import { getAppointment, postAppointment } from './appointment.controller.ts'

// Route wiring only — no logic here.
export const appointmentRouter: Router = Router()

appointmentRouter.post('/', postAppointment)
// The Customer's receipt (PRD Screen 4). Read-only — no mutation on this path.
appointmentRouter.get('/:id', getAppointment)
