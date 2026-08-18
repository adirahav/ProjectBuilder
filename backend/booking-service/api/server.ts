import { createApp } from './app.ts'
import { config } from './lib/config.ts'
import { connectDb } from './lib/db.ts'

const app = createApp()

// Kick off the DB connection but do not await it before listening: the HTTP
// server must come up either way so /health stays answerable and /health/ready
// can report the real state instead of the process crash-looping.
void connectDb()

app.listen(config.port, () => {
  console.log(`booking-service listening on port ${config.port}`)
})
