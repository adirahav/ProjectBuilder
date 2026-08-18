import { createApp } from './app.ts'
import { config } from './lib/config.ts'

const app = createApp()

app.listen(config.port, () => {
  console.log(`api-gateway listening on port ${config.port}`)
})
