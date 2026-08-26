import type { Request, Response, NextFunction } from 'express'
import * as seatService from './seat.service.js'

export async function createSeatBooking(req: Request, res: Response, next: NextFunction) {
  try {
    const input = seatService.validateBookingInput(req.body)
    const seat = await seatService.requestSeat(input)
    // Passenger fields are deliberately absent from the response — they are
    // write-only on this public surface.
    res.status(201).json({ seat })
  } catch (err) {
    next(err)
  }
}
