import 'dotenv/config'

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

// api-gateway is stateless: no MONGODB_URI, and it never issues tokens.
// It only verifies them (JWT_SECRET must be identical to user-service's),
// and needs the internal URLs of the services it will proxy to.
export const config = {
  port: Number(process.env.PORT ?? 4000),
  frontendOrigin: required('FRONTEND_ORIGIN', 'http://localhost:5173'),
  jwtSecret: process.env.JWT_SECRET ?? '',
  bookingServiceUrl: process.env.BOOKING_SERVICE_URL ?? 'http://localhost:4001',
  userServiceUrl: process.env.USER_SERVICE_URL ?? 'http://localhost:4002',
  notificationServiceUrl: process.env.NOTIFICATION_SERVICE_URL ?? 'http://localhost:4003',
}
