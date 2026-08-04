'use server'

import { and, eq, isNull } from 'drizzle-orm'
import { events } from '@/db/schema'
import { withTenant } from '@/db/tenant'
import { PermissionError, requirePermission } from '@/lib/permissions'
import { eventoSchema, eventoSchemaPartial } from './schemas'
import { construirFilasEvento } from './service'

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

async function actorPermisoEvento(
  clubSlug: string,
  permission: 'calendario.ver' | 'calendario.editar',
  teamId: string | null | undefined,
) {
  const scope = teamId ? ({ kind: 'team' as const, teamId }) : ({ kind: 'club' as const })
  try {
    return { ctx: await requirePermission(permission, scope, clubSlug), error: null as null }
  } catch (e) {
    return { ctx: null, error: e instanceof PermissionError ? e.message : 'No tenés permiso para esto.' }
  }
}

export async function crearEvento(
  clubSlug: string,
  input: unknown,
): Promise<ActionResult<{ id: string; creados: number }>> {
  const parsed = eventoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const { ctx, error } = await actorPermisoEvento(clubSlug, 'calendario.editar', parsed.data.teamId)
  if (!ctx) return { ok: false, error }

  if (!parsed.data.teamId && ctx.scopeTeamIds.length > 0) {
    return { ok: false, error: 'Un evento sin categoría solo lo puede crear la comisión directiva.' }
  }

  const construido = construirFilasEvento(parsed.data)
  if (!construido.ok) return { ok: false, error: construido.error }

  return withTenant(
    ctx.clubId,
    async ({ tx, audit }) => {
      const esSerie = construido.filas.length > 1
      const seriesId = esSerie ? crypto.randomUUID() : undefined
      const data = parsed.data

      const filas = construido.filas.map((f, i) => ({
        clubId: ctx.clubId,
        teamId: data.teamId ?? null,
        kind: data.kind,
        title: data.title,
        location: data.location || null,
        startsAt: f.startsAt,
        endsAt: f.endsAt,
        opponent: data.kind === 'partido' ? (data.opponent || null) : null,
        createdBy: ctx.userId,
        meta: esSerie ? { recurrencia: { seriesId, orden: i + 1 } } : null,
      }))

      const insertados = await tx.insert(events).values(filas).returning()

      await audit('events', insertados[0]!.id, 'create', {
        kind: data.kind,
        teamId: data.teamId ?? null,
        titulo: data.title,
        cantidad: insertados.length,
        seriesId: seriesId ?? false,
      })

      return { ok: true, data: { id: insertados[0]!.id, creados: insertados.length } }
    },
    { userId: ctx.userId },
  )
}

export async function actualizarEvento(
  clubSlug: string,
  id: string,
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = eventoSchemaPartial.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const data = parsed.data
  const teamId = data.teamId ?? undefined
  const { ctx, error } = await actorPermisoEvento(clubSlug, 'calendario.editar', teamId)
  if (!ctx) return { ok: false, error }

  return withTenant(
    ctx.clubId,
    async ({ tx }) => {
      const [actual] = await tx
        .select()
        .from(events)
        .where(and(eq(events.clubId, ctx.clubId), eq(events.id, id), isNull(events.deletedAt)))
        .limit(1)
      if (!actual) return { ok: false, error: 'No existe ese evento' }

      if (!actual.teamId && ctx.scopeTeamIds.length > 0) {
        return { ok: false, error: 'No podés modificar un evento de la comisión.' }
      }
      if (actual.teamId && ctx.scopeTeamIds.length > 0 && !ctx.scopeTeamIds.includes(actual.teamId)) {
        return { ok: false, error: 'Ese evento no es de tu categoría.' }
      }

      if (data.startsAt) {
        const endsAt = data.endsAt ? new Date(data.endsAt) : new Date(actual.endsAt ?? actual.startsAt)
        if (endsAt <= new Date(data.startsAt)) {
          return { ok: false, error: 'La hora de fin debe ser posterior a la de inicio.' }
        }
      }

      await tx
        .update(events)
        .set({
          ...(data.kind !== undefined && { kind: data.kind }),
          ...(data.teamId !== undefined && { teamId: data.teamId ?? null }),
          ...(data.title !== undefined && { title: data.title }),
          ...(data.location !== undefined && { location: data.location || null }),
          ...(data.startsAt !== undefined && { startsAt: new Date(data.startsAt) }),
          ...(data.endsAt !== undefined && { endsAt: new Date(data.endsAt) }),
          ...(data.opponent !== undefined && { opponent: data.opponent || null }),
        })
        .where(eq(events.id, id))

      return { ok: true, data: null }
    },
    { userId: ctx.userId },
  )
}

export async function eliminarEvento(clubSlug: string, id: string): Promise<ActionResult<null>> {
  const { ctx, error } = await actorPermisoEvento(clubSlug, 'calendario.editar', undefined)
  if (!ctx) return { ok: false, error }

  return withTenant(
    ctx.clubId,
    async ({ tx, audit }) => {
      const [actual] = await tx
        .select()
        .from(events)
        .where(and(eq(events.clubId, ctx.clubId), eq(events.id, id), isNull(events.deletedAt)))
        .limit(1)
      if (!actual) return { ok: false, error: 'No existe ese evento' }

      if (actual.teamId && ctx.scopeTeamIds.length > 0 && !ctx.scopeTeamIds.includes(actual.teamId)) {
        return { ok: false, error: 'Ese evento no es de tu categoría.' }
      }

      await tx.update(events).set({ deletedAt: new Date() }).where(eq(events.id, id))
      await audit('events', id, 'delete', { deletedAt: true })

      return { ok: true, data: null }
    },
    { userId: ctx.userId },
  )
}
