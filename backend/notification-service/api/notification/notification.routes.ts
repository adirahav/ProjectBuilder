import { Router } from 'express'

import { postAppointmentConfirmation } from './notification.controller.ts'
import { validateAppointmentConfirmation } from './notification.middleware.ts'

// Route wiring only — no logic here.
export const notificationRouter: Router = Router()

notificationRouter.post(
  '/appointment-confirmation',
  validateAppointmentConfirmation,
  postAppointmentConfirmation,
)
