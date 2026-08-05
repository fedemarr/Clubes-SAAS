'use server'

import { and, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm'
import { events, participations, teamMembers } from '@/db/schema'
import { withTenant } from '@/db/tenant'
import { PermissionError, type Permission, requirePermission } from '@/lib/permissions'
import { emitirNotificaciones } from '@/lib/notifications/emit'
import { eventoSchema, eventoSchemaPartial, convocatoriaSchema, asistenciaSchema } from './schemas'
import { construirFilasEvento, resolverDestinatariosConvocatoria } from './service'

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

async function actorPermisoEvento(
  clubSlug: string,
  permission: Permission,
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

export async function publicarConvocatoria(
  clubSlug: string,
  input: unknown,
): Promise<ActionResult<{ convocados: number; notificados: number }>> {
  const parsed = convocatoriaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const { ctx, error } = await actorPermisoEvento(clubSlug, 'convocatoria.publicar', undefined)
  if (!ctx) return { ok: false, error }

  return withTenant(
    ctx.clubId,
    async ({ tx, audit, onCommit }) => {
      const [evento] = await tx
        .select()
        .from(events)
        .where(and(eq(events.clubId, ctx.clubId), eq(events.id, parsed.data.eventId), isNull(events.deletedAt)))
        .limit(1)
      if (!evento) return { ok: false, error: 'No existe ese evento' }

      if (!evento.teamId) {
        return { ok: false, error: 'Los eventos sin categoría no se convocan.' }
      }
      if (ctx.scopeTeamIds.length > 0 && !ctx.scopeTeamIds.includes(evento.teamId)) {
        return { ok: false, error: 'Ese evento no es de tu categoría.' }
      }

      const today = new Date().toISOString().slice(0, 10)
      const enPlantel = await tx
        .select({ personId: teamMembers.personId })
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.clubId, ctx.clubId),
            eq(teamMembers.teamId, evento.teamId),
            inArray(teamMembers.personId, parsed.data.personIds),
            or(isNull(teamMembers.validTo), gte(teamMembers.validTo, today)),
          ),
        )
      if (enPlantel.length !== parsed.data.personIds.length) {
        return { ok: false, error: 'Alguno de los seleccionados no forma parte del plantel de la categoría.' }
      }

      await tx
        .insert(participations)
        .values(
          parsed.data.personIds.map((personId) => ({
            clubId: ctx.clubId,
            eventId: evento.id,
            personId,
            status: 'convocado' as const,
            recordedBy: ctx.userId,
          })),
        )
        .onConflictDoNothing()

      const destinatarios = await resolverDestinatariosConvocatoria(tx, ctx.clubId, parsed.data.personIds)
      const notificados = await emitirNotificaciones(
        { tx, onCommit },
        ctx.clubId,
        destinatarios.map((userId) => ({
          userId,
          type: 'convocatoria.publicada',
          title: `Convocatoria · ${evento.title}`,
          body: `Fuiste convocado/a para ${evento.title}.`,
          data: { eventId: evento.id, startsAt: evento.startsAt.toISOString() },
        })),
      )

      // participations no tiene trigger de auditoría (ver DECISIONS.md): el
      // audit() de nivel 1 es la única traza que queda de la convocatoria.
      await audit('participations', null, 'custom', {
        eventId: evento.id,
        convocados: parsed.data.personIds.length,
        notificados,
      })

      return { ok: true, data: { convocados: parsed.data.personIds.length, notificados } }
    },
    { userId: ctx.userId },
  )
}

/**
 * Guarda la asistencia de un lote de jugadores en un solo viaje (optimizado
 * para pantalla mobile con mala señal). Hace upsert sobre participations:
 * `convocado` (limpiar) y los estados de asistencia reales actualizan la fila,
 * los jugadores marcados sin fila previa la crean. Idempotente: correr el
 * mismo lote dos veces deja el mismo estado.
 */
export async function registrarAsistenciaLote(
  clubSlug: string,
  input: unknown,
): Promise<ActionResult<{ guardados: number }>> {
  const parsed = asistenciaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const { ctx, error } = await actorPermisoEvento(clubSlug, 'asistencia.tomar', undefined)
  if (!ctx) return { ok: false, error }

  return withTenant(
    ctx.clubId,
    async ({ tx, audit }) => {
      const [evento] = await tx
        .select()
        .from(events)
        .where(and(eq(events.clubId, ctx.clubId), eq(events.id, parsed.data.eventId), isNull(events.deletedAt)))
        .limit(1)
      if (!evento) return { ok: false, error: 'No existe ese evento' }

      if (!evento.teamId) {
        return { ok: false, error: 'Los eventos sin categoría no toman asistencia.' }
      }
      if (ctx.scopeTeamIds.length > 0 && !ctx.scopeTeamIds.includes(evento.teamId)) {
        return { ok: false, error: 'Ese evento no es de tu categoría.' }
      }

      const today = new Date().toISOString().slice(0, 10)
      const enPlantel = await tx
        .select({ personId: teamMembers.personId })
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.clubId, ctx.clubId),
            eq(teamMembers.teamId, evento.teamId),
            inArray(
              teamMembers.personId,
              parsed.data.cambios.map((c) => c.personId),
            ),
            or(isNull(teamMembers.validTo), gte(teamMembers.validTo, today)),
          ),
        )
      if (enPlantel.length !== parsed.data.cambios.length) {
        return { ok: false, error: 'Alguno de los jugadores no forma parte del plantel de la categoría.' }
      }

      await tx
        .insert(participations)
        .values(
          parsed.data.cambios.map((c) => ({
            clubId: ctx.clubId,
            eventId: evento.id,
            personId: c.personId,
            status: c.status,
            recordedBy: ctx.userId,
          })),
        )
        .onConflictDoUpdate({
          target: [participations.eventId, participations.personId],
          set: { status: sql`excluded.status`, recordedBy: ctx.userId, recordedAt: new Date() },
        })

      await audit('participations', null, 'custom', {
        eventId: evento.id,
        action: 'asistencia',
        cambios: parsed.data.cambios.length,
      })

      return { ok: true, data: { guardados: parsed.data.cambios.length } }
    },
    { userId: ctx.userId },
  )
}
