import { createApp } from './app.js'
import { env } from './lib/env.js'
import { connectDB } from './lib/db.js'

async function start(): Promise<void> {
	await connectDB(env.mongodbUri)

	const app = createApp({ frontendOrigin: env.frontendOrigin })

	app.listen(env.port, () => {
		console.log(`[server] booking-service listening on port ${env.port}`)
	})
}

start().catch((err: unknown) => {
	console.log('[server] Failed to start', err instanceof Error ? err.message : err)
	process.exit(1)
})
