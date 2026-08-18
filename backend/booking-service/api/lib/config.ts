import 'dotenv/config'

// booking-service owns Service / TimeSlot / Appointment, so it needs a database.
// It never signs or verifies JWTs — auth is enforced at api-gateway, which
// forwards the x-internal-admin header. So there is deliberately no JWT_SECRET here.
export const config = {
  port: Number(process.env.PORT ?? 4001),
  mongodbUri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/booking-service',
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
}
