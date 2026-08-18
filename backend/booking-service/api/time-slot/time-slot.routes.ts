import { Router } from 'express'

import { getTimeSlots, postTimeSlotHold } from './time-slot.controller.ts'

// Route wiring only — no logic here.
export const timeSlotRouter: Router = Router()

timeSlotRouter.get('/', getTimeSlots)
timeSlotRouter.post('/:id/hold', postTimeSlotHold)
