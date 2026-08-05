import { and, asc, desc, eq, ilike, inArray, isNull, like, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { withTenant } from '@/db/tenant'
import { accounts, charges, ledgerEntries, payments, persons } from '@/db/schema'
import { decimalToCents } from '@/lib/money'
import type { Tx } from '@/db/tenant'

/**
 * Cuentas para la pantalla de cobrador: con texto, búsqueda por apellido,
 * nombre, documento o label; sin texto, la lista de deudores (saldo > 0)
 * ordenada de mayor a mayor deuda — que es la lista que el cobrador mira.
 */
export async function buscarCuentaParaCobrar(clubId: string, texto: string) {
  return withTenant(clubId, async ({ tx }) => {
    const t = texto.trim()
    const cuentas = await tx
      .select({
        id: accounts.id,
        label: accounts.label,
        holderNombre: persons.firstName,
        holderApellido: persons.lastName,
        documento: persons.docNumber,
      })
      .from(accounts)
      .innerJoin(persons, eq(persons.id, accounts.holderPersonId))
      .where(
        and(
          eq(accounts.clubId, clubId),
          isNull(accounts.deletedAt),
          t === ''
            ? undefined
            : or(
                ilike(persons.lastName, `%${t}%`),
                ilike(persons.firstName, `%${t}%`),
                ilike(persons.docNumber, `%${t}%`),
                ilike(accounts.label, `%${t}%`),
              ),
        ),
      )
      .orderBy(asc(persons.lastName))
      .limit(30)

    if (cuentas.length === 0) return []
    const ids = cuentas.map((c) => c.id)
    const saldos = await tx.execute<{ account_id: string; balance: string }>(
      sql`SELECT account_id, balance FROM account_balances WHERE account_id IN (${sql.join(ids, sql`, `)})`,
    )
    const porId = new Map(saldos.rows.map((r) => [r.account_id, r.balance]))
    const list = cuentas.map((c) => ({ ...c, balanceCents: decimalToCents(porId.get(c.id) ?? '0') }))
    if (t === '') return list.filter((c) => c.balanceCents > 0).sort((a, b) => b.balanceCents - a.balanceCents)
    return list
  })
}

/** Créditos vigentes (no reversados) por cargo, para calcular lo pagado. */
export async function creditosPorCargo(tx: Tx, clubId: string, chargeIds: string[]): Promise<Map<string, number>> {
  if (chargeIds.length === 0) return new Map()
  const rows = await tx
    .select({ chargeId: ledgerEntries.chargeId, total: sql<string>`COALESCE(SUM(${ledgerEntries.amount}), 0)` })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.clubId, clubId),
        eq(ledgerEntries.direction, 'credito'),
        inArray(ledgerEntries.chargeId, chargeIds),
        isNull(ledgerEntries.reversesEntryId),
      ),
    )
    .groupBy(ledgerEntries.chargeId)
  return new Map(rows.map((r) => [r.chargeId!, decimalToCents(r.total)]))
}

export type CargoConDeuda = {
  id: string
  period: string
  concept: string
  dueOn: string
  amountCents: number
  pagadoCents: number
  saldoCents: number
}

export async function deudaDeCuentaEnTx(tx: Tx, clubId: string, accountId: string): Promise<CargoConDeuda[]> {
  const cargos = await tx
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

  const pagado = await creditosPorCargo(
    tx,
    clubId,
    cargos.map((c) => c.id),
  )
  return cargos
    .map((c) => {
      const amountCents = decimalToCents(c.amount)
      const pagadoCents = pagado.get(c.id) ?? 0
      return {
        id: c.id,
        period: c.period,
        concept: c.concept,
        dueOn: c.dueOn,
        amountCents,
        pagadoCents,
        saldoCents: Math.max(0, amountCents - pagadoCents),
      }
    })
    .filter((c) => c.saldoCents > 0)
}

export async function deudaDeCuenta(clubId: string, accountId: string): Promise<CargoConDeuda[]> {
  return withTenant(clubId, ({ tx }) => deudaDeCuentaEnTx(tx, clubId, accountId))
}

export type PagoCajaDia = {
  id: string
  montoCents: number
  paidAt: Date
  cobradorNombre: string | null
  cobradorApellido: string | null
  cuentaLabel: string | null
  holderNombre: string
  holderApellido: string
}

export async function cajaDelDia(clubId: string, desde: Date, hasta: Date): Promise<PagoCajaDia[]> {
  const cobrador = alias(persons, 'cobrador')
  const titular = alias(persons, 'titular')
  return withTenant(clubId, async ({ tx }) => {
    const rows = await tx
      .select({
        id: payments.id,
        amount: payments.amount,
        paidAt: payments.paidAt,
        cobradorNombre: cobrador.firstName,
        cobradorApellido: cobrador.lastName,
        cuentaLabel: accounts.label,
        holderNombre: titular.firstName,
        holderApellido: titular.lastName,
      })
      .from(payments)
      .innerJoin(accounts, eq(accounts.id, payments.accountId))
      .innerJoin(titular, eq(titular.id, accounts.holderPersonId))
      .leftJoin(cobrador, eq(cobrador.id, payments.recordedBy))
      .where(
        and(eq(payments.clubId, clubId), eq(payments.method, 'efectivo'), eq(payments.status, 'acreditado'), and(sql`${payments.paidAt} >= ${desde}`, sql`${payments.paidAt} < ${hasta}`)),
      )
      .orderBy(desc(payments.paidAt))
    return rows.map((r) => ({ ...r, montoCents: decimalToCents(r.amount) }))
  })
}

export type PagoPendiente = {
  id: string
  method: string
  amount: string
  paidAt: Date
  externalRef: string | null
  rawPayload: Record<string, unknown> | null
}

/** Bandeja de transferencias no identificadas: pagos sin cuenta asignada. */
export async function listarPagosPendientes(clubId: string): Promise<PagoPendiente[]> {
  return withTenant(clubId, async ({ tx }) => {
    return tx
      .select({
        id: payments.id,
        method: payments.method,
        amount: payments.amount,
        paidAt: payments.paidAt,
        externalRef: payments.externalRef,
        rawPayload: payments.rawPayload,
      })
      .from(payments)
      .where(and(eq(payments.clubId, clubId), eq(payments.status, 'pendiente'), isNull(payments.accountId)))
      .orderBy(desc(payments.paidAt))
  })
}

// ---------------------------------------------------------------------------
// M4.4 · Débito automático
// ---------------------------------------------------------------------------

export type CuentaDebitable = {
  accountId: string
  label: string | null
  holderNombre: string
  holderApellido: string
  cbu: string
  deudaCents: number
}

/** Saldos (account_balances) de un conjunto de cuentas, en centavos. */
async function saldosDeCuentas(tx: Tx, clubId: string, accountIds: string[]): Promise<Map<string, number>> {
  if (accountIds.length === 0) return new Map()
  const saldos = await tx.execute<{ account_id: string; balance: string }>(
    sql`SELECT account_id, balance FROM account_balances WHERE account_id IN (${sql.join(accountIds, sql`, `)})`,
  )
  return new Map(saldos.rows.map((r) => [r.account_id, decimalToCents(r.balance)]))
}

type CuentaHolderRow = {
  accountId: string
  label: string | null
  holderNombre: string
  holderApellido: string
  cbu: string | null
}

async function cuentasDeudoras(tx: Tx, clubId: string): Promise<CuentaHolderRow[]> {
  const rows = await tx
    .select({
      accountId: accounts.id,
      label: accounts.label,
      holderNombre: persons.firstName,
      holderApellido: persons.lastName,
      cbu: sql<string | null>`${persons.custom}->>'debitoCbu'`,
    })
    .from(accounts)
    .innerJoin(persons, eq(persons.id, accounts.holderPersonId))
    .where(and(eq(accounts.clubId, clubId), isNull(accounts.deletedAt)))
    .orderBy(asc(persons.lastName))

  if (rows.length === 0) return []
  const ids = rows.map((r) => r.accountId)
  const balance = await saldosDeCuentas(tx, clubId, ids)
  return rows.filter((r) => (balance.get(r.accountId) ?? 0) > 0)
}

/**
 * Cuentas con CBU cargado para débito y saldo deudor, que no tengan ya un
 * débito en cola (payment pendiente en un lote abierto). Son los candidatos
 * del próximo lote. El CBU vive en persons.custom.debitoCbu del titular
 * (schema fijo, ver DECISIONS.md — M4.4).
 */
export async function cuentasDebitables(clubId: string): Promise<CuentaDebitable[]> {
  return withTenant(clubId, async ({ tx }) => {
    const deudoras = await cuentasDeudoras(tx, clubId)
    const conCbu = deudoras.filter((r): r is typeof r & { cbu: string } => Boolean(r.cbu))
    if (conCbu.length === 0) return []

    const enCola = await tx
      .select({ accountId: payments.accountId })
      .from(payments)
      .where(
        and(
          eq(payments.clubId, clubId),
          eq(payments.method, 'debito_automatico'),
          eq(payments.status, 'pendiente'),
        ),
      )
    const enColaIds = new Set(enCola.map((p) => p.accountId).filter((id): id is string => Boolean(id)))

    const balance = await saldosDeCuentas(tx, clubId, conCbu.map((c) => c.accountId))
    return conCbu
      .filter((c) => !enColaIds.has(c.accountId))
      .map((c) => ({ ...c, cbu: c.cbu, deudaCents: balance.get(c.accountId) ?? 0 }))
      .filter((c) => c.deudaCents > 0)
  })
}

/**
 * Cuentas deudoras cuyo titular todavía no tiene CBU cargado. Es la lista para
 * completar datos de débito antes de generar el primer lote.
 */
export async function cuentasSinCbuParaDebito(clubId: string): Promise<CuentaDebitable[]> {
  return withTenant(clubId, async ({ tx }) => {
    const deudoras = await cuentasDeudoras(tx, clubId)
    const balance = await saldosDeCuentas(
      tx,
      clubId,
      deudoras.filter((r) => !r.cbu).map((r) => r.accountId),
    )
    return deudoras
      .filter((r) => !r.cbu)
      .map((r) => ({ ...r, cbu: '', deudaCents: balance.get(r.accountId) ?? 0 }))
  })
}

export type LoteDebito = {
  id: string
  numero: string
  banco: string
  fechaEjecucion: string
  status: string
  montoTotal: string
  registros: number
  acreditados: number
  rechazados: number
  generadoPor: string | null
  createdAt: Date
}

type LoteDebitoRow = {
  id: string
  numero: string
  banco: string
  fecha_ejecucion: string
  status: string
  monto_total: string
  registros: number
  acreditados: number
  rechazados: number
  generado_por: string | null
  created_at: Date
}

export async function listarLotesDebitoEnTx(tx: Tx, clubId: string): Promise<LoteDebito[]> {
  const rows = await tx.execute<LoteDebitoRow>(
    sql`SELECT * FROM debito_lotes WHERE club_id = ${clubId} ORDER BY created_at DESC`,
  )
  return rows.rows.map((r) => ({
    id: r.id,
    numero: r.numero,
    banco: r.banco,
    fechaEjecucion: r.fecha_ejecucion,
    status: r.status,
    montoTotal: r.monto_total,
    registros: r.registros,
    acreditados: r.acreditados,
    rechazados: r.rechazados,
    generadoPor: r.generado_por,
    createdAt: r.created_at,
  }))
}

export async function listarLotesDebito(clubId: string): Promise<LoteDebito[]> {
  return withTenant(clubId, ({ tx }) => listarLotesDebitoEnTx(tx, clubId))
}

/** Payments del lote: los que tienen externalRef 'debito:<numero>:…'. */
export async function pagosDelLote(tx: Tx, clubId: string, numero: string) {
  return tx
    .select()
    .from(payments)
    .where(and(eq(payments.clubId, clubId), like(payments.externalRef, `debito:${numero}:%`)))
    .orderBy(asc(payments.paidAt))
}
