import { drizzle } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'

import * as schema from './schema.ts'

// Turso (libsql) connection. Falls back to a local SQLite file for dev
// if TURSO_DATABASE_URL is not set.
const url = process.env.TURSO_DATABASE_URL || 'file:dev.db'
const authToken = process.env.TURSO_DATABASE_URL
  ? process.env.TURSO_AUTH_TOKEN
  : undefined

const client = createClient({ url, authToken })

export const db = drizzle(client, { schema })
