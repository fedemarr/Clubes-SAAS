import { and, asc, eq, gte, isNull, lte, or } from 'drizzle-orm'
import { db } from '@/db/client'
import { withTenant } from '@/db/tenant'
import { accounts, clubs, feePlans, memberships, persons } from '@/db/schema'
import { decimalToCents } from '@/lib/money'
import { planVigente, primerDiaPeriodo, ultimoDiaPeriodo } from './service'
import type { ConfigFinanzas, PlanConMonto } from './service'

export async function listarPlanes(clubId: string) {
  return withTenant(clubId, async ({ tx }) => {
    return tx
      .select()
      .from(feePlans)
      .where(eq(feePlans.clubId, clubId))
      .orderBy(asc(feePlans.sport), asc(feePlans.validFrom))
  })
}

/** Plan vigente hoy por deporte (y uno solo para los "sin deporte"). */
export async function listarPlanesVigentes(clubId: string) {
  return withTenant(clubId, async ({ tx }) => {
    const planes = await tx
      .select()
      .from(feePlans)
      .where(eq(feePlans.clubId, clubId))
      .orderBy(asc(feePlans.sport), asc(feePlans.validFrom))

    const hoy = new Date().toISOString().slice(0, 10)
    const vigentes = new Map<string, (typeof planes)[number]>()
    for (const p of planes) {
      const key = p.sport ?? '__sin_deporte__'
      const actual = vigentes.get(key)
      if (!actual) {
        vigentes.set(key, p)
        continue
      }
      const candidato = planVigente([actual, p], hoy)
      if (candidato?.id === p.id) vigentes.set(key, p)
    }
    return [...vigentes.values()].map((p) => ({ ...p, amountCents: decimalToCents(p.amount) }))
  })
}

export async function listarDeportesConPlan(clubId: string): Promise<string[]> {
  return withTenant(clubId, async ({ tx }) => {
    const rows = await tx
      .selectDistinct({ sport: feePlans.sport })
      .from(feePlans)
      .where(eq(feePlans.clubId, clubId))
    return rows.map((r) => r.sport).filter((s): s is string => Boolean(s)).sort()
  })
}

export async function listarMembresiasDeCuenta(clubId: string, accountId: string) {
  return withTenant(clubId, async ({ tx }) => {
    return tx
      .select({
        id: memberships.id,
        personId: memberships.personId,
        nombre: persons.firstName,
        apellido: persons.lastName,
        planNombre: feePlans.name,
        planSport: feePlans.sport,
        planAmount: feePlans.amount,
        status: memberships.status,
        startedOn: memberships.startedOn,
        endedOn: memberships.endedOn,
      })
      .from(memberships)
      .innerJoin(persons, eq(persons.id, memberships.personId))
      .innerJoin(feePlans, eq(feePlans.id, memberships.feePlanId))
      .where(and(eq(memberships.clubId, clubId), eq(memberships.accountId, accountId)))
      .orderBy(asc(memberships.startedOn))
  })
}

export async function listarMembresias(clubId: string) {
  return withTenant(clubId, async ({ tx }) => {
    return tx
      .select({
        id: memberships.id,
        personaNombre: persons.firstName,
        personaApellido: persons.lastName,
        cuentaLabel: accounts.label,
        cuentaHolder: accounts.holderPersonId,
        planNombre: feePlans.name,
        planSport: feePlans.sport,
        planAmount: feePlans.amount,
        status: memberships.status,
        startedOn: memberships.startedOn,
        endedOn: memberships.endedOn,
      })
      .from(memberships)
      .innerJoin(persons, eq(persons.id, memberships.personId))
      .innerJoin(accounts, eq(accounts.id, memberships.accountId))
      .innerJoin(feePlans, eq(feePlans.id, memberships.feePlanId))
      .where(eq(memberships.clubId, clubId))
      .orderBy(asc(persons.lastName))
  })
}

export async function buscarCuentas(clubId: string) {
  return withTenant(clubId, async ({ tx }) => {
    return tx
      .select({
        id: accounts.id,
        label: accounts.label,
        holderNombre: persons.firstName,
        holderApellido: persons.lastName,
      })
      .from(accounts)
      .innerJoin(persons, eq(persons.id, accounts.holderPersonId))
      .where(and(eq(accounts.clubId, clubId), isNull(accounts.deletedAt)))
      .orderBy(asc(persons.lastName))
      .limit(100)
  })
}

export async function listarPersonasActivas(clubId: string) {
  return withTenant(clubId, async ({ tx }) => {
    return tx
      .select({ id: persons.id, nombre: persons.firstName, apellido: persons.lastName })
      .from(persons)
      .where(and(eq(persons.clubId, clubId), eq(persons.status, 'activo'), isNull(persons.deletedAt)))
      .orderBy(asc(persons.lastName))
  })
}

export async function listarMembresiasActivasDePersona(clubId: string, personId: string) {
  return withTenant(clubId, async ({ tx }) => {
    const hoy = new Date().toISOString().slice(0, 10)
    return tx
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.clubId, clubId),
          eq(memberships.personId, personId),
          eq(memberships.status, 'activa'),
          or(isNull(memberships.endedOn), gte(memberships.endedOn, hoy)),
        ),
      )
  })
}

export async function planesParaCargo(clubId: string): Promise<PlanConMonto[]> {
  return withTenant(clubId, async ({ tx }) => {
    const planes = await tx.select().from(feePlans).where(eq(feePlans.clubId, clubId))
    return planes.map((p) => ({
      id: p.id,
      sport: p.sport,
      name: p.name,
      amountCents: decimalToCents(p.amount),
      siblingDiscounts: p.siblingDiscounts,
      validFrom: p.validFrom,
      validTo: p.validTo,
    }))
  })
}

/** Membresías activas que tocan el período (alto/bajo a mitad de mes incluidas). */
export async function membresiasParaPeriodo(clubId: string, periodo: string) {
  const primer = primerDiaPeriodo(periodo)
  const ultimo = ultimoDiaPeriodo(periodo)
  return withTenant(clubId, async ({ tx }) => {
    return tx
      .select({
        id: memberships.id,
        accountId: memberships.accountId,
        personId: memberships.personId,
        startedOn: memberships.startedOn,
        endedOn: memberships.endedOn,
        sport: feePlans.sport,
        personaNombre: persons.firstName,
        personaApellido: persons.lastName,
        cuentaLabel: accounts.label,
      })
      .from(memberships)
      .innerJoin(feePlans, eq(feePlans.id, memberships.feePlanId))
      .innerJoin(persons, eq(persons.id, memberships.personId))
      .innerJoin(accounts, eq(accounts.id, memberships.accountId))
      .where(
        and(
          eq(memberships.clubId, clubId),
          eq(memberships.status, 'activa'),
          lte(memberships.startedOn, ultimo),
          or(isNull(memberships.endedOn), gte(memberships.endedOn, primer)),
        ),
      )
  })
}

/** Configuración financiera del club (clubs no tiene RLS: se lee directo). */
export async function obtenerConfigFinanzas(clubId: string): Promise<ConfigFinanzas> {
  const [club] = await db
    .select({ financeConfig: clubs.financeConfig })
    .from(clubs)
    .where(eq(clubs.id, clubId))
    .limit(1)
  return {
    prorrateoParcial: club?.financeConfig?.prorrateoParcial ?? 'prorratear',
    vencimientoDia: club?.financeConfig?.vencimientoDia ?? 10,
  }
}
