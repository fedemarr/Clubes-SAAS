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
import { listarDocumentosTx, type DocumentoItem } from '@/modules/documentos/queries'
import { resolverFotoUrl } from '@/lib/storage/r2'

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

export type PersonaGrupo = { id: string; nombre: string }

/** Las personas del grupo familiar con su nombre, para los selects del portal. */
export async function grupoFamiliar(clubId: string, memberPersonId: string): Promise<PersonaGrupo[]> {
  return withTenant(clubId, async ({ tx }) => {
    const personIds = await personasDelMiembroTx(tx, clubId, memberPersonId)
    const personas = await tx
      .select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName })
      .from(persons)
      .where(and(eq(persons.clubId, clubId), inArray(persons.id, personIds)))
    return personas.map((p) => ({
      id: p.id,
      nombre: `${p.firstName} ${p.lastName}`.trim(),
    }))
  })
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
  persona: {
    id: string
    firstName: string
    lastName: string
    photoUrl: string | null
    docType: string
    docNumber: string | null
  }
  cuentas: CuentaPortal[]
  proximoEvento: EventoPortal | null
  /** Categorías del usuario (no del grupo familiar), para el encabezado. */
  categorias: { teamId: string; label: string; sport: string }[]
  /** Plan activo del usuario para la tarjeta de débito automático (visual). */
  cuotaPlan: { planNombre: string; montoCents: number } | null
}

/**
 * Todo lo que muestra el home del portal: cuentas del grupo familiar con
 * su saldo y cargos abiertos, y el próximo evento de las categorías de
 * las personas a cargo. Un solo withTenant.
 */
export async function datosPortal(clubId: string, memberPersonId: string): Promise<DatosPortal> {
  return withTenant(clubId, async ({ tx }) => {
    const [persona] = await tx
      .select({
        id: persons.id,
        firstName: persons.firstName,
        lastName: persons.lastName,
        photoUrl: persons.photoUrl,
        docType: persons.docType,
        docNumber: persons.docNumber,
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
          photoUrl: null,
          docType: 'DNI',
          docNumber: null,
        },
        cuentas: [],
        proximoEvento: null,
        categorias: [],
        cuotaPlan: null,
      }
    }
    const hoy = new Date().toISOString().slice(0, 10)

    // Antes esto era ~5 queries secuenciales + 3 MÁS POR CADA cuenta del
    // grupo familiar (un select por cuenta, uno a account_balances, uno a
    // charges — un N+1 clásico: con 2-3 cuentas eran 10+ round trips solo
    // para esta sección). Ahora: personIds primero (todo lo demás depende
    // de él), después TODO lo que solo depende de personIds/memberPersonId
    // en paralelo (Promise.all no evita que Postgres las procese una por
    // una en la misma conexión, pero tampoco cuesta nada — y si el driver
    // en algún momento pipelinea, esto ya está listo), y el detalle de
    // cuentas (info + saldo + cargos) en 3 queries BATCH con IN (...) en
    // vez de un loop, sin importar cuántas cuentas tenga la familia.
    const personIds = await personasDelMiembroTx(tx, clubId, memberPersonId)
    persona.photoUrl = await resolverFotoUrl(persona.photoUrl)

    const [membresias, cuentasHolder, teamIds, categorias, plan] = await Promise.all([
      tx
        .select({ accountId: memberships.accountId })
        .from(memberships)
        .where(
          and(
            eq(memberships.clubId, clubId),
            inArray(memberships.personId, personIds),
            eq(memberships.status, 'activa'),
          ),
        ),
      tx
        .select({ id: accounts.id, label: accounts.label })
        .from(accounts)
        .where(and(eq(accounts.clubId, clubId), inArray(accounts.holderPersonId, personIds), isNull(accounts.deletedAt))),
      tx
        .select({ teamId: teamMembers.teamId })
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.clubId, clubId),
            inArray(teamMembers.personId, personIds),
            or(isNull(teamMembers.validTo), gte(teamMembers.validTo, hoy)),
          ),
        )
        .then((rows) => rows.map((t) => t.teamId)),
      tx
        .select({ teamId: teams.id, label: teams.label, sport: teams.sport })
        .from(teamMembers)
        .innerJoin(teams, eq(teams.id, teamMembers.teamId))
        .where(
          and(
            eq(teamMembers.clubId, clubId),
            eq(teamMembers.personId, memberPersonId),
            or(isNull(teamMembers.validTo), gte(teamMembers.validTo, hoy)),
          ),
        ),
      tx
        .select({ planNombre: feePlans.name, monto: feePlans.amount })
        .from(memberships)
        .innerJoin(feePlans, eq(feePlans.id, memberships.feePlanId))
        .where(
          and(
            eq(memberships.clubId, clubId),
            eq(memberships.personId, memberPersonId),
            eq(memberships.status, 'activa'),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]),
    ])

    const accountIds = [...new Set([...membresias.map((m) => m.accountId), ...cuentasHolder.map((c) => c.id)])]

    let cuentas: CuentaPortal[] = []
    if (accountIds.length > 0) {
      const [cuentasInfo, saldos, cargosRaw] = await Promise.all([
        tx
          .select({
            id: accounts.id,
            label: accounts.label,
            holderNombre: persons.firstName,
            holderApellido: persons.lastName,
          })
          .from(accounts)
          .innerJoin(persons, eq(persons.id, accounts.holderPersonId))
          .where(inArray(accounts.id, accountIds)),
        tx.execute<{ account_id: string; balance: string }>(
          sql`SELECT account_id, balance FROM account_balances WHERE account_id IN (${sql.join(accountIds, sql`, `)})`,
        ),
        tx
          .select()
          .from(charges)
          .where(
            and(
              eq(charges.clubId, clubId),
              inArray(charges.accountId, accountIds),
              inArray(charges.status, ['pendiente', 'parcial', 'vencido']),
            ),
          )
          .orderBy(asc(charges.dueOn)),
      ])
      const saldoPorCuenta = new Map(saldos.rows.map((r) => [r.account_id, r.balance]))
      const cargosPorCuenta = new Map<string, typeof cargosRaw>()
      for (const c of cargosRaw) {
        const lista = cargosPorCuenta.get(c.accountId) ?? []
        lista.push(c)
        cargosPorCuenta.set(c.accountId, lista)
      }

      cuentas = accountIds
        .map((accountId) => {
          const cuenta = cuentasInfo.find((c) => c.id === accountId)
          if (!cuenta) return null
          return {
            accountId,
            label: cuenta.label,
            holderNombre: `${cuenta.holderNombre} ${cuenta.holderApellido}`,
            balanceCents: decimalToCents(saldoPorCuenta.get(accountId) ?? '0'),
            cargos: (cargosPorCuenta.get(accountId) ?? []).map((c) => ({
              id: c.id,
              concept: c.concept,
              period: c.period,
              status: c.status,
              dueOn: c.dueOn,
              amountCents: decimalToCents(c.amount),
            })),
          }
        })
        .filter((c): c is CuentaPortal => c !== null)
    }

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

    return {
      persona,
      cuentas,
      proximoEvento,
      categorias,
      cuotaPlan: plan ? { planNombre: plan.planNombre, montoCents: decimalToCents(plan.monto) } : null,
    }
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
    persona.photoUrl = await resolverFotoUrl(persona.photoUrl)

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

/**
 * Documentos del socio y de sus hijos a cargo (grupo familiar). Solo sus
 * propios documentos: personIds sale de personasDelMiembroTx, nunca de un
 * id libre. Reusa la query del módulo documentos con la variante Tx para no
 * anidar withTenant.
 */
export async function misDocumentos(clubId: string, memberPersonId: string): Promise<DocumentoItem[]> {
  return withTenant(clubId, async ({ tx }) => {
    const personIds = await personasDelMiembroTx(tx, clubId, memberPersonId)
    return listarDocumentosTx(tx, clubId, { personIds })
  })
}
