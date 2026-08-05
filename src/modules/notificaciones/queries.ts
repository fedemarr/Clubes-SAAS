import { sql } from 'drizzle-orm'
import { withTenant } from '@/db/tenant'

export type Notificacion = {
  id: string
  type: string
  title: string
  body: string | null
  readAt: Date | null
  createdAt: Date
}

/**
 * Bandeja de notificaciones del usuario en un club. La tabla notifications
 * vive en rls.sql (sección 10) y no tiene policy por user_id, solo por club:
 * el filtro de destinatario es responsabilidad de esta query (y de la
 * acción), nunca del cliente.
 */
export async function listarNotificaciones(
  clubId: string,
  userId: string,
  limit = 50,
): Promise<Notificacion[]> {
  return withTenant(clubId, async ({ tx }) => {
    const rows = await tx.execute<{
      id: string
      type: string
      title: string
      body: string | null
      read_at: Date | null
      created_at: Date
    }>(
      sql`SELECT id, type, title, body, read_at, created_at
          FROM notifications
          WHERE club_id = ${clubId} AND user_id = ${userId}
          ORDER BY created_at DESC
          LIMIT ${limit}`,
    )
    return rows.rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      readAt: r.read_at ? new Date(r.read_at) : null,
      createdAt: new Date(r.created_at),
    }))
  })
}

export async function contarNoLeidas(clubId: string, userId: string): Promise<number> {
  return withTenant(clubId, async ({ tx }) => {
    const { rows } = await tx.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n
          FROM notifications
          WHERE club_id = ${clubId} AND user_id = ${userId} AND read_at IS NULL`,
    )
    return rows[0]?.n ?? 0
  })
}
