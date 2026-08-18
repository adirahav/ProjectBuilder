import { Router } from 'express'

import { getServices } from './service.controller.ts'

// Route wiring only — no logic here.
export const serviceRouter: Router = Router()

serviceRouter.get('/', getServices)
