import express from 'express'
import cors from 'cors'
import { config } from './lib/config.js'
import { tourRouter } from './tour/tour.routes.js'
import { busRouter } from './bus/bus.routes.js'
import { seatRouter } from './seat/seat.routes.js'
import { errorHandler, notFoundHandler } from './lib/error.middleware.js'

export function createApp() {
  const app = express()

  // Mounted first, before any other route or middleware: the hosting platform
  // needs this to know the process is alive. It never requires auth and never
  // touches the database — it only proves the process itself is up.
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' })
  })

  app.disable('x-powered-by')
  // CORS is restricted to the configured frontend origin only.
  app.use(cors({ origin: config.frontendOrigin }))
  app.use(express.json({ limit: '64kb' }))

  app.use('/api/tours', tourRouter)
  app.use('/api/buses', busRouter)
  app.use('/api/seats', seatRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
