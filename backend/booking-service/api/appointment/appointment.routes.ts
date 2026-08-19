import { Router } from 'express'

import { postAppointment } from './appointment.controller.ts'

// Route wiring only — no logic here.
export const appointmentRouter: Router = Router()

appointmentRouter.post('/', postAppointment)
