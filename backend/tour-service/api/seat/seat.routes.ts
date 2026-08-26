import { Router } from 'express'
import * as seatController from './seat.controller.js'

const router = Router()

// Public passenger `request` action. The admin seat actions (approve, cancel,
// toggle-reserve, manual-assign, swap-move) are separate tickets — when they
// land they MUST be admin-authenticated and MUST NOT reuse this public path.
router.post('/bookings', seatController.createSeatBooking)

export const seatRouter = router
