'use server'

import { and, eq, gte, isNull, ne, or } from 'drizzle-orm'
import { teamMembers, teams } from '@/db/schema'
import { withTenant } from '@/db/tenant'
import { PermissionError, requirePermission } from '@/lib/permissions'
import { asignacionSchema, categoriaSchema } from './schemas'

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

async function actor(clubSlug: string, permission: 'categorias.ver' | 'categorias.editar') {
  try {
    return { ctx: await requirePermission(permission, { kind: 'club' }, clubSlug), error: null as null }
  } catch (e) {
    return { ctx: null, error: e instanceof PermissionError ? e.message : 'No tenés permiso para esto.' }
  }
}

export async function crearCategoria(clubSlug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = categoriaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const { ctx, error } = await actor(clubSlug, 'categorias.editar')
  if (!ctx) return { ok: false, error }

  return withTenant(
    ctx.clubId,
    async ({ tx }) => {
      const [categoria] = await tx.insert(teams).values({ clubId: ctx.clubId, ...parsed.data }).returning()
      if (!categoria) return { ok: false, error: 'No se pudo crear la categoría' }
      return { ok: true, data: { id: categoria.id } }
    },
    { userId: ctx.userId },
  )
}

export async function actualizarCategoria(clubSlug: string, id: string, input: unknown): Promise<ActionResult<null>> {
  const parsed = categoriaSchema.partial().safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const { ctx, error } = await actor(clubSlug, 'categorias.editar')
  if (!ctx) return { ok: false, error }

  return withTenant(
    ctx.clubId,
    async ({ tx }) => {
      await tx.update(teams).set(parsed.data).where(and(eq(teams.clubId, ctx.clubId), eq(teams.id, id)))
      return { ok: true, data: null }
    },
    { userId: ctx.userId },
  )
}

/**
 * Abre una nueva fila de plantel con vigencia y cierra (validTo) cualquier
 * otra activa de la persona en el MISMO deporte — no puede jugar dos
 * categorías del mismo deporte a la vez, pero sí rugby y hockey juntos.
 */
export async function asignarPersonaACategoria(clubSlug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = asignacionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const { ctx, error } = await actor(clubSlug, 'categorias.editar')
  if (!ctx) return { ok: false, error }

  return withTenant(
    ctx.clubId,
    async ({ tx, audit }) => {
      const [categoria] = await tx.select().from(teams).where(and(eq(teams.clubId, ctx.clubId), eq(teams.id, parsed.data.teamId))).limit(1)
      if (!categoria) return { ok: false, error: 'La categoría no existe' }

      const today = new Date().toISOString().slice(0, 10)
      const otrasDelMismoDeporte = await tx
        .select({ id: teamMembers.id })
        .from(teamMembers)
        .innerJoin(teams, eq(teams.id, teamMembers.teamId))
        .where(
          and(
            eq(teamMembers.clubId, ctx.clubId),
            eq(teamMembers.personId, parsed.data.personId),
            eq(teams.sport, categoria.sport),
            ne(teamMembers.teamId, parsed.data.teamId),
            or(isNull(teamMembers.validTo), gte(teamMembers.validTo, today)),
          ),
        )

      for (const previa of otrasDelMismoDeporte) {
        await tx.update(teamMembers).set({ validTo: parsed.data.validFrom }).where(eq(teamMembers.id, previa.id))
      }

      const [membership] = await tx
        .insert(teamMembers)
        .values({
          clubId: ctx.clubId,
          teamId: parsed.data.teamId,
          personId: parsed.data.personId,
          position: parsed.data.position,
          validFrom: parsed.data.validFrom,
        })
        .returning()
      if (!membership) return { ok: false, error: 'No se pudo asignar la categoría' }

      // team_members no tiene el trigger de auditoría (ver DECISIONS.md):
      // acá el audit() de nivel 1 es la única traza que va a quedar.
      await audit('team_members', membership.id, 'create', {
        personId: parsed.data.personId,
        teamId: parsed.data.teamId,
        categoria: `${categoria.sport} ${categoria.label}`,
        cerroAnteriores: otrasDelMismoDeporte.length,
      })

      return { ok: true, data: { id: membership.id } }
    },
    { userId: ctx.userId },
  )
}
