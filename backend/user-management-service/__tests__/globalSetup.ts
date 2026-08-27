import { MongoMemoryServer } from 'mongodb-memory-server'
import type { TestProject } from 'vitest/node'

let mongo: MongoMemoryServer

/**
 * One in-memory MongoDB for the whole run. Tests never point at the real
 * `hila-tours` development database (.rule/testing-rules.md).
 */
export default async function setup({ provide }: TestProject) {
  mongo = await MongoMemoryServer.create()
  provide('mongoUri', mongo.getUri('user-management-service-test'))

  return async () => {
    await mongo.stop()
  }
}

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string
  }
}
