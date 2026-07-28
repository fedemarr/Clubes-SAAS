import { Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import * as schema from './schema'

// Node 22+ trae WebSocket nativo: @neondatabase/serverless lo usa solo,
// no hace falta el paquete `ws` (que además rompe al bundlearse en el
// middleware de Next — ver DECISIONS.md).

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL no está seteada (revisá .env.local)')
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

export const db = drizzle(pool, { schema })
export type Db = typeof db
