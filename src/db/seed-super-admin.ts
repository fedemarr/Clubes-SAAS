import { sql } from 'drizzle-orm'
import { db } from './client'

/**
 * Super Admin (M9): alta del primer administrador global. Idempotente:
 * hace INSERT ... ON CONFLICT DO NOTHING por email, y además garantiza que
 * el usuario exista en `users` (login por credentials con password).
 *
 * Bootstrap por defecto: fede@fmcode.com (definido en CLAUDE.md). Se puede
 * correr de nuevo para agregar más super admins pasando SUPER_ADMIN_EMAIL.
 */

const DEFAULT_EMAIL = 'fede@fmcode.com'

function assertNotProduction() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed-super-admin.ts: NODE_ENV=production. Abortado.')
  }

  const rawUrl = process.env.DATABASE_URL
  if (!rawUrl) throw new Error('seed-super-admin.ts: DATABASE_URL no está seteada.')

  const allowedHost = process.env.SEED_ALLOWED_DB_HOST
  if (!allowedHost) {
    throw new Error('seed-super-admin.ts: falta SEED_ALLOWED_DB_HOST (mismo guard que db:seed).')
  }

  const actualHost = new URL(rawUrl).hostname
  if (actualHost !== allowedHost) {
    throw new Error(
      `seed-super-admin.ts: DATABASE_URL apunta a "${actualHost}", no a la base de desarrollo esperada ` +
        `("${allowedHost}"). Abortado.`,
    )
  }
}

async function main() {
  assertNotProduction()

  const email = process.env.SUPER_ADMIN_EMAIL?.trim() || DEFAULT_EMAIL

  // Necesita password para el login credentials. Si el user no existe, no se
  // puede hacer seed de su password aquí (bcrypt se generó con hash en el
  // seed M1). Mensaje claro si falta.
  const result = await db.execute(sql`
    SELECT id FROM users WHERE email = ${email}
  `)
  if (result.rows.length === 0) {
    console.warn(
      `✖ No existe user con email "${email}". Corré primero npm run db:seed ` +
        `(o registrá el usuario por /registro) y volvé a correr este seed.`,
    )
  }

  await db.execute(sql`
    INSERT INTO super_admin_users (email, notes)
    VALUES (${email}, 'alta inicial super admin (M9)')
    ON CONFLICT (email) DO NOTHING
  `)
  console.log(`✔ Super admin garantizado: ${email}`)
  console.log('\nListo.')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })