import { and, asc, eq, gte, isNull, or } from 'drizzle-orm'
import { withTenant } from '@/db/tenant'
import { persons, teamMembers, teams } from '@/db/schema'

export async function listarCategorias(clubId: string, opts: { soloActivas?: boolean } = {}) {
  return withTenant(clubId, async ({ tx }) => {
    const conditions = [eq(teams.clubId, clubId), isNull(teams.deletedAt)]
    if (opts.soloActivas) conditions.push(eq(teams.isActive, true))
    return tx
      .select()
      .from(teams)
      .where(and(...conditions))
      .orderBy(asc(teams.sport), asc(teams.label))
  })
}

export async function obtenerCategoria(clubId: string, id: string) {
  return withTenant(clubId, async ({ tx }) => {
    const [categoria] = await tx
      .select()
      .from(teams)
      .where(and(eq(teams.clubId, clubId), eq(teams.id, id)))
      .limit(1)
    return categoria
  })
}

export async function obtenerPlantel(clubId: string, teamId: string) {
  return withTenant(clubId, async ({ tx }) => {
    const today = new Date().toISOString().slice(0, 10)
    return tx
      .select({
        membershipId: teamMembers.id,
        personId: persons.id,
        nombre: persons.firstName,
        apellido: persons.lastName,
        position: teamMembers.position,
        validFrom: teamMembers.validFrom,
      })
      .from(teamMembers)
      .innerJoin(persons, eq(persons.id, teamMembers.personId))
      .where(
        and(
          eq(teamMembers.clubId, clubId),
          eq(teamMembers.teamId, teamId),
          or(isNull(teamMembers.validTo), gte(teamMembers.validTo, today)),
        ),
      )
      .orderBy(asc(persons.lastName))
  })
}
