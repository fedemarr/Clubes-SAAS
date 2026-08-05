import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm'
import { withTenant, type Tx } from '@/db/tenant'
import {
  accounts,
  charges,
  events,
  feePlans,
  ledgerEntries,
  memberships,
  persons,
  relationships,
  teams,
  teamMembers,
} from '@/db/schema'
import type { eventKind, chargeStatus } from '@/db/schema'
import { decimalToCents } from '@/lib/money'

/**
 * Portal del socio (M6). Las queries acá NO exigen permisos de staff: el
 * acceso ya viene acotado por el layout (shell del portal solo para rol
 * tutor/jugador) y por RLS. Igual siempre arrancan desde la persona del
 * usuario, nunca de un id libre.
 */

/** La persona del usuario + sus hijos a cargo (relationship tutor_de). */
export function personasDelMiembroTx(tx: Tx, clubId: string, memberPersonId: string): Promise<string[]> {
  return tx
    .select({ relatedPersonId: relationships.relatedPersonId })
    .from(relationships)
    .where(
      and(
        eq(relationships.clubId, clubId),
        eq(relationships.personId, memberPersonId),
        eq(relationships.kind, 'tutor_de'),
      ),
    )
    .then((hijos) => [memberPersonId, ...hijos.map((h) => h.relatedPersonId)])
}

export async function personasDelMiembro(clubId: string, memberPersonId: string): Promise<string[]> {
  return withTenant(clubId, async ({ tx }) => personasDelMiembroTx(tx, clubId, memberPersonId))
}

export type CargoPortal = {
  id: string
  concept: string
  period: string
  status: (typeof chargeStatus.enumValues)[number]
  dueOn: string
  amountCents: number
}

export type CuentaPortal = {
  accountId: string
  label: string | null
  holderNombre: string
  balanceCents: number
  cargos: CargoPortal[]
}

export type EventoPortal = {
  id: string
  kind: (typeof eventKind.enumValues)[number]
  title: string | null
  location: string | null
  startsAt: Date
  endsAt: Date | null
  opponent: string | null
  categoriaLabel: string | null
  deporte: string | null
}

export type DatosPortal = {
  persona: { id: string; firstName: string; lastName: string }
  cuentas: CuentaPortal[]
  proximoEvento: EventoPortal | null
}

/**
 * Todo lo que muestra el home del portal: cuentas del grupo familiar con
 * su saldo y cargos abiertos, y el próximo evento de las categorías de
 * las personas a cargo. Un solo withTenant.
 */
export async function datosPortal(clubId: string, memberPersonId: string): Promise<DatosPortal> {
  return withTenant(clubId, async ({ tx }) => {
    const [persona] = await tx
      .select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName })
      .from(persons)
      .where(and(eq(persons.clubId, clubId), eq(persons.id, memberPersonId)))
      .limit(1)
    if (!persona) return { persona: { id: memberPersonId, firstName: '', lastName: '' }, cuentas: [], proximoEvento: null }

    const personIds = await personasDelMiembroTx(tx, clubId, memberPersonId)

    const membresias = await tx
      .select({ accountId: memberships.accountId })
      .from(memberships)
      .where(
        and(
          eq(memberships.clubId, clubId),
          inArray(memberships.personId, personIds),
          eq(memberships.status, 'activa'),
        ),
      )
    const cuentasHolder = await tx
      .select({ id: accounts.id, label: accounts.label })
      .from(accounts)
      .where(and(eq(accounts.clubId, clubId), inArray(accounts.holderPersonId, personIds), isNull(accounts.deletedAt)))

    const accountIds = [...new Set([...membresias.map((m) => m.accountId), ...cuentasHolder.map((c) => c.id)])]

    const cuentas: CuentaPortal[] = []
    for (const accountId of accountIds) {
      const [cuenta] = await tx
        .select({
          id: accounts.id,
          label: accounts.label,
          holderNombre: persons.firstName,
          holderApellido: persons.lastName,
        })
        .from(accounts)
        .innerJoin(persons, eq(persons.id, accounts.holderPersonId))
        .where(eq(accounts.id, accountId))
        .limit(1)
      if (!cuenta) continue

      const saldos = await tx.execute<{ balance: string }>(
        sql`SELECT balance FROM account_balances WHERE account_id = ${accountId}`,
      )
      const cargosRaw = await tx
        .select()
        .from(charges)
        .where(
          and(
            eq(charges.clubId, clubId),
            eq(charges.accountId, accountId),
            inArray(charges.status, ['pendiente', 'parcial', 'vencido']),
          ),
        )
        .orderBy(asc(charges.dueOn))

      cuentas.push({
        accountId,
        label: cuenta.label,
        holderNombre: `${cuenta.holderNombre} ${cuenta.holderApellido}`,
        balanceCents: decimalToCents(saldos.rows[0]?.balance ?? '0'),
        cargos: cargosRaw.map((c) => ({
          id: c.id,
          concept: c.concept,
          period: c.period,
          status: c.status,
          dueOn: c.dueOn,
          amountCents: decimalToCents(c.amount),
        })),
      })
    }

    const hoy = new Date().toISOString().slice(0, 10)
    const teamIds = (
      await tx
        .select({ teamId: teamMembers.teamId })
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.clubId, clubId),
            inArray(teamMembers.personId, personIds),
            or(isNull(teamMembers.validTo), gte(teamMembers.validTo, hoy)),
          ),
        )
    ).map((t) => t.teamId)

    let proximoEvento: EventoPortal | null = null
    if (teamIds.length > 0) {
      const [evento] = await tx
        .select({
          id: events.id,
          kind: events.kind,
          title: events.title,
          location: events.location,
          startsAt: events.startsAt,
          endsAt: events.endsAt,
          opponent: events.opponent,
          categoriaLabel: teams.label,
          deporte: teams.sport,
        })
        .from(events)
        .leftJoin(teams, eq(teams.id, events.teamId))
        .where(
          and(
            eq(events.clubId, clubId),
            isNull(events.deletedAt),
            inArray(events.teamId, teamIds),
            gte(events.startsAt, new Date()),
          ),
        )
        .orderBy(asc(events.startsAt))
        .limit(1)
      proximoEvento = evento ?? null
    }

    return { persona, cuentas, proximoEvento }
  })
}

export type MembresiaCarnet = {
  planNombre: string
  sport: string | null
  status: string
  startedOn: string
}

export type DatosCarnet = {
  persona: {
    id: string
    firstName: string
    lastName: string
    docType: string
    docNumber: string | null
    memberNumber: number | null
    bornOn: string | null
    photoUrl: string | null
  }
  categorias: { teamId: string; label: string; sport: string }[]
  membresias: MembresiaCarnet[]
  cuentaLabel: string | null
}

export async function datosCarnet(clubId: string, memberPersonId: string): Promise<DatosCarnet> {
  return withTenant(clubId, async ({ tx }) => {
    const [persona] = await tx
      .select({
        id: persons.id,
        firstName: persons.firstName,
        lastName: persons.lastName,
        docType: persons.docType,
        docNumber: persons.docNumber,
        memberNumber: persons.memberNumber,
        bornOn: persons.bornOn,
        photoUrl: persons.photoUrl,
      })
      .from(persons)
      .where(and(eq(persons.clubId, clubId), eq(persons.id, memberPersonId)))
      .limit(1)
    if (!persona) {
      return {
        persona: {
          id: memberPersonId,
          firstName: '',
          lastName: '',
          docType: 'DNI',
          docNumber: null,
          memberNumber: null,
          bornOn: null,
          photoUrl: null,
        },
        categorias: [],
        membresias: [],
        cuentaLabel: null,
      }
    }

    const hoy = new Date().toISOString().slice(0, 10)

    const categorias = await tx
      .select({ teamId: teams.id, label: teams.label, sport: teams.sport })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .where(
        and(
          eq(teamMembers.clubId, clubId),
          eq(teamMembers.personId, memberPersonId),
          or(isNull(teamMembers.validTo), gte(teamMembers.validTo, hoy)),
        ),
      )

    const membresias = await tx
      .select({
        planNombre: feePlans.name,
        sport: feePlans.sport,
        status: memberships.status,
        startedOn: memberships.startedOn,
        accountId: memberships.accountId,
      })
      .from(memberships)
      .innerJoin(feePlans, eq(feePlans.id, memberships.feePlanId))
      .where(and(eq(memberships.clubId, clubId), eq(memberships.personId, memberPersonId)))

    const [cuenta] = await tx
      .select({ label: accounts.label })
      .from(accounts)
      .where(
        and(
          eq(accounts.clubId, clubId),
          eq(accounts.holderPersonId, memberPersonId),
          isNull(accounts.deletedAt),
        ),
      )
      .limit(1)

    return {
      persona,
      categorias,
      membresias: membresias.map((m) => ({
        planNombre: m.planNombre,
        sport: m.sport,
        status: m.status,
        startedOn: m.startedOn,
      })),
      cuentaLabel: cuenta?.label ?? null,
    }
  })
}

/** Últimos movimientos del grupo familiar para la pestaña de pagos. */
export type MovimientoPortal = {
  id: string
  direction: 'debito' | 'credito'
  amountCents: number
  memo: string | null
  bookedAt: Date
  source: 'cargo' | 'pago' | 'ajuste' | 'reversion'
}

export async function ultimosMovimientosPortal(clubId: string, memberPersonId: string, limit = 15): Promise<MovimientoPortal[]> {
  return withTenant(clubId, async ({ tx }) => {
    const personIds = await personasDelMiembroTx(tx, clubId, memberPersonId)
    const accountIds = (
      await tx
        .select({ accountId: memberships.accountId })
        .from(memberships)
        .where(and(eq(memberships.clubId, clubId), inArray(memberships.personId, personIds)))
    ).map((m) => m.accountId)
    if (accountIds.length === 0) return []

    const rows = await tx
      .select({
        id: ledgerEntries.id,
        direction: ledgerEntries.direction,
        amount: ledgerEntries.amount,
        memo: ledgerEntries.memo,
        bookedAt: ledgerEntries.bookedAt,
        chargeId: ledgerEntries.chargeId,
        paymentId: ledgerEntries.paymentId,
        reversesEntryId: ledgerEntries.reversesEntryId,
      })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.clubId, clubId), inArray(ledgerEntries.accountId, accountIds)))
      .orderBy(desc(ledgerEntries.bookedAt))
      .limit(limit)

    return rows.map((m) => ({
      id: m.id,
      direction: m.direction,
      amountCents: decimalToCents(m.amount),
      memo: m.memo,
      bookedAt: m.bookedAt,
      source: m.paymentId ? 'pago' as const : m.reversesEntryId ? 'reversion' as const : m.chargeId ? 'cargo' as const : 'ajuste' as const,
    }))
  })
}
