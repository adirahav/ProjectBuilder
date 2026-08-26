import { createApp } from './app.js'
import { config } from './lib/config.js'
import { connectDb } from './lib/db.js'

async function start() {
  await connectDb()
  createApp().listen(config.port, () => {
    console.log(`[SERVER] tour-service listening on port ${config.port}`)
  })
}

start().catch((err) => {
  console.log('[SERVER] failed to start:', (err as Error).message)
  process.exit(1)
})
