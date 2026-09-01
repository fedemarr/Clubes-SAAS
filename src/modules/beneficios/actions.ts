'use server'

import { sql } from 'drizzle-orm'
import { withTenant } from '@/db/tenant'
import { requirePermission } from '@/lib/permissions'
import { beneficioIdSchema, beneficioSchema } from './schemas'

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

// ---------------------------------------------------------------------------
// M12 · Beneficios del portal (configuración por club)
// ---------------------------------------------------------------------------

export async function guardarBeneficio(clubSlug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = beneficioSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const ctx = await requirePermission('beneficios.gestionar', { kind: 'club' }, clubSlug)
    const id = await withTenant(
      ctx.clubId,
      async ({ tx, audit }) => {
        const description = parsed.data.description || null
        const icon = parsed.data.icon || null

        if (parsed.data.id) {
          const { rows } = await tx.execute<{ id: string }>(sql`
            UPDATE club_benefits
            SET title = ${parsed.data.title}, description = ${description}, icon = ${icon},
                sort = ${parsed.data.sort}, active = ${parsed.data.active}
            WHERE id = ${parsed.data.id} AND club_id = ${ctx.clubId}
            RETURNING id
          `)
          const row = rows[0]
          if (!row) throw new Error('Ese beneficio no existe.')
          await audit('club_benefits', row.id, 'update', {
            title: parsed.data.title,
            description,
            icon,
            sort: parsed.data.sort,
            active: parsed.data.active,
          })
          return row.id
        }

        const { rows } = await tx.execute<{ id: string }>(sql`
          INSERT INTO club_benefits (club_id, title, description, icon, sort, active, created_by)
          VALUES (${ctx.clubId}, ${parsed.data.title}, ${description}, ${icon},
                  ${parsed.data.sort}, ${parsed.data.active}, ${ctx.userId})
          RETURNING id
        `)
        const nuevo = rows[0]
        if (!nuevo) throw new Error('No se pudo guardar el beneficio.')
        await audit('club_benefits', nuevo.id, 'create', {
          title: parsed.data.title,
          description,
          icon,
          sort: parsed.data.sort,
          active: parsed.data.active,
        })
        return nuevo.id
      },
      { userId: ctx.userId },
    )
    return { ok: true, data: { id } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}

export async function borrarBeneficio(clubSlug: string, input: unknown): Promise<ActionResult<null>> {
  const parsed = beneficioIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const ctx = await requirePermission('beneficios.gestionar', { kind: 'club' }, clubSlug)
    await withTenant(
      ctx.clubId,
      async ({ tx, audit }) => {
        const { rows } = await tx.execute<{ id: string }>(sql`
          DELETE FROM club_benefits WHERE id = ${parsed.data.id} AND club_id = ${ctx.clubId}
          RETURNING id
        `)
        if (rows.length === 0) throw new Error('Ese beneficio no existe.')
        await audit('club_benefits', parsed.data.id, 'delete', {})
      },
      { userId: ctx.userId },
    )
    return { ok: true, data: null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}