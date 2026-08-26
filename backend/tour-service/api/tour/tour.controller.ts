import type { Request, Response, NextFunction } from 'express'
import * as tourService from './tour.service.js'
import * as busService from '../bus/bus.service.js'

export async function listTours(_req: Request, res: Response, next: NextFunction) {
  try {
    const tours = await tourService.listTours()
    // An empty list is a valid, successful result — not a 404.
    res.status(200).json({ tours })
  } catch (err) {
    next(err)
  }
}

export async function listBusesByTour(req: Request, res: Response, next: NextFunction) {
  try {
    const buses = await busService.listBusesByTourUuid(String(req.params.tourId))
    res.status(200).json({ buses })
  } catch (err) {
    next(err)
  }
}
