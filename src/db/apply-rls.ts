import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Pool } from '@neondatabase/serverless'

const RLS_PATH = fileURLToPath(new URL('../../drizzle/rls.sql', import.meta.url))

/**
 * La creación de app_user vive en create-app-user.ts (necesita generar y
 * guardar una password), así que acá se saltea el bloque `CREATE ROLE
 * app_user` de rls.sql para no pisarla.
 */
function withoutAppUserRole(sql: string): string {
  const start = sql.indexOf('CREATE ROLE app_user')
  const end = sql.indexOf('-- 2. Club actual del request')
  if (start === -1 || end === -1) {
    throw new Error('No se encontraron los marcadores esperados en rls.sql')
  }
  return sql.slice(0, start) + sql.slice(end)
}

async function main() {
  if (!process.env.DATABASE_URL_OWNER) {
    throw new Error('DATABASE_URL_OWNER no está seteada (revisá .env.local o .env.production.local)')
  }

  const raw = readFileSync(RLS_PATH, 'utf8')
  const sql = withoutAppUserRole(raw)

  const pool = new Pool({ connectionString: process.env.DATABASE_URL_OWNER })
  await pool.query(sql)
  await pool.end()

  console.log('rls.sql aplicado (sin el bloque de creación de app_user).')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
