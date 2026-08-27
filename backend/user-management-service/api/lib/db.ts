import mongoose from 'mongoose'
import { config } from './config.js'

export async function connectDb(uri: string = config.mongodbUri): Promise<void> {
  mongoose.set('strictQuery', true)
  await mongoose.connect(uri, config.dbName ? { dbName: config.dbName } : {})
  console.log('[DB] connected')
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect()
  console.log('[DB] disconnected')
}
