import { sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { auth } from '@/lib/auth/config'

/**
 * Super Admin (M9). Acceso global: el SA opera sobre todos los tenants, por
 * eso no pasa por RLS (las tablas super_admin_users/super_admin_log no
 * llevan club_id, como clubs/users). El guard es: sesión activa + email del
 * usuario existe en super_admin_users.
 */

export type SuperAdminCtx = {
  userId: string
  email: string
}

/**
 * Contexto de super admin de la sesión actual, o null. Correrlo en el layout
 * de /super-admin y en cada action. El email viene de la sesión (users, sin
 * RLS) y se contrasta contra super_admin_users (global, sin RLS).
 */
export async function esSuperAdmin(): Promise<SuperAdminCtx | null> {
  const session = await auth()
  if (!session?.user?.id || !session.user.email) return null

  const rows = await db.execute(sql`
    SELECT id, email FROM super_admin_users WHERE email = ${session.user.email}
  `)
  if (rows.rows.length === 0) return null

  return { userId: session.user.id, email: session.user.email }
}

/** Igual que esSuperAdmin pero tira en vez de devolver null (para actions). */
export async function requireSuperAdmin(): Promise<SuperAdminCtx> {
  const ctx = await esSuperAdmin()
  if (!ctx) throw new Error('No tenés acceso de super admin')
  return ctx
}

/**
 * Auditoría de una acción de super admin. Escribe en super_admin_log (global
 * sin RLS, como clubs/users). Las acciones son best-effort pero la fila es
 * consistente: el trigger de auditoría estructural no aplica acá.
 */
export async function registrarAccionSuperAdmin(
  actorEmail: string,
  action: string,
  entity: string,
  entityId: string | null,
  diff?: Record<string, unknown> | null,
  ip?: string | null,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO super_admin_log (actor_email, action, entity, entity_id, diff, ip)
    VALUES (
      ${actorEmail},
      ${action},
      ${entity},
      ${entityId},
      ${diff ? JSON.stringify(diff) : null}::jsonb,
      ${ip ?? null}
    )
  `)
}