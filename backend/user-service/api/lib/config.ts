import 'dotenv/config'

// user-service owns the Admin collection, so it needs a database.
// It is also the only service that SIGNS JWTs (api-gateway verifies them), so
// JWT_SECRET here must be identical to api-gateway's.
export const config = {
  port: Number(process.env.PORT ?? 4002),
  mongodbUri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/user-service',
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET ?? '',
  // 24h per plan 011 Open Question 2: long enough for a single Admin's daily
  // use, short enough to bound a leaked token. There is no refresh token in v1.
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '24h',
}
