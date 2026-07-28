import { randomBytes } from 'node:crypto'
import { Pool } from '@neondatabase/serverless'

/**
 * Crea (o reactiva) el rol app_user con los GRANTs de la sección 1 de
 * rls.sql y le habilita LOGIN con password. No vive en rls.sql porque la
 * password es un secreto de cada entorno, no algo para commitear.
 *
 * Corre con DATABASE_URL_OWNER (hace falta ser owner para CREATE ROLE).
 * Imprime la connection string de app_user para pegarla en DATABASE_URL.
 */
async function main() {
  if (!process.env.DATABASE_URL_OWNER) {
    throw new Error('DATABASE_URL_OWNER no está seteada (revisá .env.local)')
  }

  const password = process.env.APP_USER_PASSWORD ?? randomBytes(24).toString('base64url')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_OWNER })

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user NOLOGIN;
      END IF;
    END $$;

    GRANT USAGE ON SCHEMA public TO app_user;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
    ALTER ROLE app_user WITH LOGIN PASSWORD '${password.replace(/'/g, "''")}';
  `)

  await pool.end()

  const ownerUrl = new URL(process.env.DATABASE_URL_OWNER)
  const appUrl = new URL(process.env.DATABASE_URL_OWNER)
  appUrl.username = 'app_user'
  appUrl.password = password

  console.log('app_user listo. Pegá esto como DATABASE_URL en .env.local:\n')
  console.log(appUrl.toString())
  console.log(`\n(mismo host que ${ownerUrl.hostname}; si tenés un endpoint -pooler, usalo acá para el runtime)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
