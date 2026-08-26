import type { Request, Response, NextFunction } from 'express'
import * as busService from './bus.service.js'

export async function getSeatMap(req: Request, res: Response, next: NextFunction) {
  try {
    const seatMap = await busService.getSeatMap(String(req.params.busId))
    // This response is the sole source of truth for seat state (PRD NFR) — it
    // must never be served from a cache.
    res.set('Cache-Control', 'no-store')
    res.status(200).json(seatMap)
  } catch (err) {
    next(err)
  }
}
