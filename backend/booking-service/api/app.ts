import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'

export type CreateAppOptions = {
	frontendOrigin?: string
}

export function createApp(options: CreateAppOptions = {}): Express {
	const app = express()

	// Health check is mounted FIRST — before CORS, body parsing, auth, or any
	// other middleware. It must prove only that this process is alive, so it
	// never requires auth and never touches the database.
	app.get('/health', (_req: Request, res: Response) => {
		res.status(200).json({ status: 'ok' })
	})

	const frontendOrigin = options.frontendOrigin ?? 'http://localhost:5173'
	app.use(cors({ origin: frontendOrigin, credentials: true }))
	app.use(express.json())

	// Domain routes are mounted here by later plans:
	//   /api/service     -> api/service/service.routes.ts
	//   /api/timeSlot    -> api/timeSlot/timeSlot.routes.ts
	//   /api/appointment -> api/appointment/appointment.routes.ts

	app.use((_req: Request, res: Response) => {
		res.status(404).json({ error: 'Not found' })
	})

	app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
		console.log('[app] Unhandled error', err instanceof Error ? err.message : err)
		res.status(500).json({ error: 'Internal server error' })
	})

	return app
}
