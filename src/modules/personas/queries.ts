import { and, asc, eq, gte, ilike, isNull, or, sql } from 'drizzle-orm'
import { withTenant } from '@/db/tenant'
import { persons, relationships, personRoles, teamMembers, teams } from '@/db/schema'
import type { BusquedaInput } from './schemas'

export async function buscarPersonas(clubId: string, filtro: BusquedaInput) {
  return withTenant(clubId, async ({ tx }) => {
    const today = new Date().toISOString().slice(0, 10)

    const conditions = [eq(persons.clubId, clubId), isNull(persons.deletedAt)]

    if (filtro.q) {
      const q = `%${filtro.q}%`
      const matchTexto = or(
        ilike(persons.lastName, q),
        ilike(persons.firstName, q),
        ilike(persons.docNumber, q),
        sql`${persons.memberNumber}::text ilike ${q}`,
      )
      if (matchTexto) conditions.push(matchTexto)
    }
    if (filtro.estado) conditions.push(eq(persons.status, filtro.estado))
    if (filtro.categoria) conditions.push(eq(teamMembers.teamId, filtro.categoria))

    return tx
      .select({
        id: persons.id,
        firstName: persons.firstName,
        lastName: persons.lastName,
        docNumber: persons.docNumber,
        memberNumber: persons.memberNumber,
        status: persons.status,
        categoria: teams.label,
      })
      .from(persons)
      .leftJoin(
        teamMembers,
        and(eq(teamMembers.personId, persons.id), or(isNull(teamMembers.validTo), gte(teamMembers.validTo, today))),
      )
      .leftJoin(teams, eq(teams.id, teamMembers.teamId))
      .where(and(...conditions))
      .orderBy(asc(persons.lastName), asc(persons.firstName))
  })
}

export async function obtenerPersona(clubId: string, id: string) {
  return withTenant(clubId, async ({ tx }) => {
    const [persona] = await tx
      .select()
      .from(persons)
      .where(and(eq(persons.clubId, clubId), eq(persons.id, id)))
      .limit(1)
    return persona
  })
}

/** Vínculos donde participa la persona, mirando desde los dos lados (ver DECISIONS.md / plan M1). */
export async function obtenerFamilia(clubId: string, personId: string) {
  return withTenant(clubId, async ({ tx }) => {
    const comoOrigen = await tx
      .select({
        id: relationships.id,
        kind: relationships.kind,
        otraPersonaId: relationships.relatedPersonId,
        otraPersonaNombre: sql<string>`${persons.firstName} || ' ' || ${persons.lastName}`,
        direccion: sql<'origen'>`'origen'`,
      })
      .from(relationships)
      .innerJoin(persons, eq(persons.id, relationships.relatedPersonId))
      .where(and(eq(relationships.clubId, clubId), eq(relationships.personId, personId)))

    const comoDestino = await tx
      .select({
        id: relationships.id,
        kind: relationships.kind,
        otraPersonaId: relationships.personId,
        otraPersonaNombre: sql<string>`${persons.firstName} || ' ' || ${persons.lastName}`,
        direccion: sql<'destino'>`'destino'`,
      })
      .from(relationships)
      .innerJoin(persons, eq(persons.id, relationships.personId))
      .where(and(eq(relationships.clubId, clubId), eq(relationships.relatedPersonId, personId)))

    return [...comoOrigen, ...comoDestino]
  })
}

export async function obtenerRoles(clubId: string, personId: string) {
  return withTenant(clubId, async ({ tx }) => {
    return tx
      .select({
        id: personRoles.id,
        role: personRoles.role,
        scopeTeamId: personRoles.scopeTeamId,
        categoria: teams.label,
        validFrom: personRoles.validFrom,
        validTo: personRoles.validTo,
      })
      .from(personRoles)
      .leftJoin(teams, eq(teams.id, personRoles.scopeTeamId))
      .where(and(eq(personRoles.clubId, clubId), eq(personRoles.personId, personId)))
      .orderBy(sql`${personRoles.validFrom} desc`)
  })
}

/**
 * Historial de auditoría de la persona: cambios directos a `persons` +
 * cambios a sus `person_roles` y `relationships` (donde participa). SQL
 * crudo porque `batch_id` no está tipado en schema.ts (ver DECISIONS.md).
 */
export async function obtenerHistorialAuditoria(clubId: string, personId: string) {
  return withTenant(clubId, async ({ tx }) => {
    const result = await tx.execute(sql`
      select * from audit_log
      where club_id = ${clubId}
        and (
          (entity = 'persons' and entity_id = ${personId})
          or (entity = 'person_roles' and entity_id in (
            select id from person_roles where club_id = ${clubId} and person_id = ${personId}
          ))
          or (entity = 'relationships' and entity_id in (
            select id from relationships where club_id = ${clubId}
              and (person_id = ${personId} or related_person_id = ${personId})
          ))
        )
      order by at desc
    `)
    return result.rows
  })
}
