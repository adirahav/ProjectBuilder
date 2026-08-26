import { Router } from 'express'
import * as tourController from './tour.controller.js'

const router = Router()

// Both routes are public: the PRD states the passenger flow has no auth step.
router.get('/', tourController.listTours)
router.get('/:tourId/buses', tourController.listBusesByTour)

export const tourRouter = router
