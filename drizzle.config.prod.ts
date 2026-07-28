import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// Igual a drizzle.config.ts pero contra .env.production.local (nunca
// .env.local). Se usa a mano, una vez por cambio de schema, para migrar
// producción — ver DECISIONS.md.
config({ path: '.env.production.local' })

if (!process.env.DATABASE_URL_OWNER) {
  throw new Error('DATABASE_URL_OWNER no está seteada (revisá .env.production.local)')
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL_OWNER,
  },
})
