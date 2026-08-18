import { createApp } from './app.ts'
import { config } from './lib/config.ts'

const app = createApp()

// No database connection to establish — this service is stateless at this stage.
app.listen(config.port, () => {
  console.log(`notification-service listening on port ${config.port}`)
})
