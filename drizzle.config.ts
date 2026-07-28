import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

config({ path: '.env.local' })

// Migraciones y DDL corren como owner de Neon, no como app_user (que no
// puede alterar tablas/políticas de RLS). Ver DECISIONS.md.
if (!process.env.DATABASE_URL_OWNER) {
  throw new Error('DATABASE_URL_OWNER no está seteada (revisá .env.local)')
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL_OWNER,
  },
})
