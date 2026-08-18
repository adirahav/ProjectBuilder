import mongoose from 'mongoose'

import { config } from './config.ts'

// Mongoose readyState -> a readable label for the readiness probe.
const READY_STATE_LABELS: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
}

/**
 * Current connection state, read straight from Mongoose's in-memory
 * readyState. This performs NO database round-trip, which is what makes it
 * safe to call from an HTTP probe handler.
 */
export function getDbStatus(): string {
  return READY_STATE_LABELS[mongoose.connection.readyState] ?? 'unknown'
}

export function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1
}

/**
 * Connect to MongoDB.
 *
 * Deliberately non-fatal: a failed initial connection is logged and swallowed
 * so the HTTP server still boots and /health can keep answering 200. Mongoose
 * retries in the background on its own, so a brief DB outage degrades the
 * service instead of putting the process into a crash-loop.
 */
export async function connectDb(uri: string = config.mongodbUri): Promise<void> {
  mongoose.connection.on('connected', () => {
    console.log('user-service: MongoDB connected')
  })
  mongoose.connection.on('disconnected', () => {
    console.warn('user-service: MongoDB disconnected')
  })
  mongoose.connection.on('error', (err) => {
    console.error('user-service: MongoDB connection error:', err.message)
  })

  try {
    // serverSelectionTimeoutMS keeps a DB-down boot from hanging for 30s.
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 })
  } catch (err) {
    console.error(
      'user-service: initial MongoDB connection failed, continuing to boot:',
      (err as Error).message,
    )
  }
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect()
}
