import 'dotenv/config'

// notification-service is stateless: it owns no collection, so it needs no
// MONGODB_URI. It also never signs or verifies a JWT — user-service signs and
// api-gateway verifies — so it needs no JWT_SECRET either.
export const config = {
  port: Number(process.env.PORT ?? 4003),
}
