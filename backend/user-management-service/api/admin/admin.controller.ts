import type { Request, Response, NextFunction } from 'express'
import * as adminService from './admin.service.js'

export async function signup(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await adminService.signup(req.body)
    // 201 Created, body is exactly the contract's `SignupResponse`.
    res.status(201).json(result)
  } catch (err) {
    next(err)
  }
}
