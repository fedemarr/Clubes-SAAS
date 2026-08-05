'use server'

import { sql } from 'drizzle-orm'
import { withTenant } from '@/db/tenant'
import { requirePermission } from '@/lib/permissions'
import { z } from 'zod'

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

const idSchema = z.object({ id: z.string().uuid() })

/**
 * Marca como leída una notificación propia. El WHERE incluye user_id, así
 * que solo se toca la propia aunque se adivine un id ajeno.
 */
export async function marcarLeida(clubSlug: string, input: unknown): Promise<ActionResult<null>> {
  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const ctx = await requirePermission('notificaciones.ver', { kind: 'club' }, clubSlug)
    await withTenant(
      ctx.clubId,
      async ({ tx }) => {
        await tx.execute(sql`
          UPDATE notifications SET read_at = COALESCE(read_at, now())
          WHERE club_id = ${ctx.clubId} AND user_id = ${ctx.userId} AND id = ${parsed.data.id}
        `)
      },
      { userId: ctx.userId },
    )
    return { ok: true, data: null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}

export async function marcarTodasLeidas(clubSlug: string): Promise<ActionResult<{ marcadas: number }>> {
  try {
    const ctx = await requirePermission('notificaciones.ver', { kind: 'club' }, clubSlug)
    const marcadas = await withTenant(
      ctx.clubId,
      async ({ tx }) => {
        const { rows } = await tx.execute<{ n: number }>(sql`
          UPDATE notifications SET read_at = now()
          WHERE club_id = ${ctx.clubId} AND user_id = ${ctx.userId} AND read_at IS NULL
          RETURNING 1
        `)
        return rows.length
      },
      { userId: ctx.userId },
    )
    return { ok: true, data: { marcadas } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}
