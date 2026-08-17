import mongoose from 'mongoose'

mongoose.set('strictQuery', true)

export async function connectDB(uri: string): Promise<typeof mongoose> {
	try {
		const connection = await mongoose.connect(uri)
		console.log('[db] Connected to MongoDB')
		return connection
	} catch (err) {
		console.log('[db] Failed to connect to MongoDB', err instanceof Error ? err.message : err)
		throw err
	}
}

export async function disconnectDB(): Promise<void> {
	await mongoose.disconnect()
	console.log('[db] Disconnected from MongoDB')
}
