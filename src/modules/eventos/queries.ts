import { and, asc, eq, gte, isNull, sql } from 'drizzle-orm'
import { withTenant } from '@/db/tenant'
import { events, teams } from '@/db/schema'
import type { eventKind } from '@/db/schema'

export type FiltroEventos = {
  deporte?: string
  categoriaId?: string
  kind?: (typeof eventKind.enumValues)[number]
  teamIds?: string[] | null
}

export async function listarEventos(clubId: string, filtro: FiltroEventos = {}) {
  return withTenant(clubId, async ({ tx }) => {
    const conds = [
      eq(events.clubId, clubId),
      isNull(events.deletedAt),
      gte(events.startsAt, new Date()),
    ]

    if (filtro.deporte) conds.push(eq(teams.sport, filtro.deporte))
    if (filtro.categoriaId) conds.push(eq(events.teamId, filtro.categoriaId))
    if (filtro.kind) conds.push(eq(events.kind, filtro.kind))
    if (filtro.teamIds?.length) {
      conds.push(sql`${events.teamId} IN (${sql.join(filtro.teamIds.map((id) => sql`${id}`), sql`, `)})`)
    }

    return tx
      .select({
        id: events.id,
        kind: events.kind,
        title: events.title,
        location: events.location,
        startsAt: events.startsAt,
        endsAt: events.endsAt,
        opponent: events.opponent,
        teamId: events.teamId,
        categoriaLabel: teams.label,
        deporte: teams.sport,
        meta: events.meta,
      })
      .from(events)
      .leftJoin(teams, eq(teams.id, events.teamId))
      .where(and(...conds))
      .orderBy(asc(events.startsAt))
  })
}

export async function obtenerEvento(clubId: string, id: string) {
  return withTenant(clubId, async ({ tx }) => {
    const [evento] = await tx
      .select({
        id: events.id,
        kind: events.kind,
        title: events.title,
        location: events.location,
        startsAt: events.startsAt,
        endsAt: events.endsAt,
        opponent: events.opponent,
        teamId: events.teamId,
        createdBy: events.createdBy,
        meta: events.meta,
        categoriaLabel: teams.label,
        deporte: teams.sport,
      })
      .from(events)
      .leftJoin(teams, eq(teams.id, events.teamId))
      .where(and(eq(events.clubId, clubId), eq(events.id, id), isNull(events.deletedAt)))
      .limit(1)
    return evento
  })
}

export async function listarCategoriasActivas(clubId: string) {
  return withTenant(clubId, async ({ tx }) => {
    return tx
      .select({ id: teams.id, label: teams.label, sport: teams.sport, season: teams.season })
      .from(teams)
      .where(and(eq(teams.clubId, clubId), eq(teams.isActive, true), isNull(teams.deletedAt)))
      .orderBy(asc(teams.sport), asc(teams.label))
  })
}

export async function listarDeportes(clubId: string): Promise<string[]> {
  return withTenant(clubId, async ({ tx }) => {
    const rows = await tx
      .selectDistinct({ sport: teams.sport })
      .from(teams)
      .where(and(eq(teams.clubId, clubId), isNull(teams.deletedAt)))
    return rows.map((r) => r.sport).sort()
  })
}
