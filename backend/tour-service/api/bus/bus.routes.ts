import { Router } from 'express'
import * as busController from './bus.controller.js'

const router = Router()

// Public: the passenger seat map requires no auth step (PRD).
router.get('/:busId/seats', busController.getSeatMap)

export const busRouter = router
