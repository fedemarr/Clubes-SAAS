import { and, asc, eq, gte, inArray, isNull, notInArray, or, sql, type SQL } from 'drizzle-orm'
import { withTenant, type Tx } from '@/db/tenant'
import { accounts, charges, ledgerEntries, memberships, persons, teams, teamMembers } from '@/db/schema'
import { decimalToCents } from '@/lib/money'

/** dd/mm/yyyy para los Excel — las fechas viajan como texto, sin zona horaria. */
function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  if (!y || !m || !d) return ''
  return `${d}/${m}/${y}`
}

function fmtFechaHora(d: Date | string): string {
  const iso = typeof d === 'string' ? d : d.toISOString()
  return `${iso.slice(0, 10).split('-').reverse().join('/')} ${iso.slice(11, 16)}`
}

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------

export type FilaPersonaExport = {
  apellido: string
  nombre: string
  documento: string | null
  nroSocio: number | null
  email: string | null
  telefono: string | null
  nacimiento: string
  categoria: string | null
  deporte: string | null
  estado: string
}

export type NotaAuditoriaExport = {
  at: string
  action: string
  entity: string
  diff: Record<string, unknown> | null
}

export async function personasParaExportar(
  clubId: string,
  filtros: { categoria?: string | null; estado?: string | null; deporte?: string | null; conDeuda?: 'si' | 'no' | null },
): Promise<{ filas: FilaPersonaExport[]; notas: NotaAuditoriaExport[] }> {
  return withTenant(clubId, async ({ tx }) => {
    const hoy = new Date().toISOString().slice(0, 10)
    const conditions: SQL[] = [eq(persons.clubId, clubId), isNull(persons.deletedAt)]

    if (filtros.estado) conditions.push(sql`${persons.status} = ${filtros.estado}`)
    if (filtros.categoria) conditions.push(eq(teamMembers.teamId, filtros.categoria))
    if (filtros.deporte) conditions.push(eq(teams.sport, filtros.deporte))

    if (filtros.conDeuda) {
      const saldos = await tx.execute<{ account_id: string; holder_person_id: string }>(
        sql`SELECT account_id, holder_person_id FROM account_balances WHERE balance > 0`,
      )
      const personasConDeuda = new Set<string>(saldos.rows.map((r) => r.holder_person_id))
      if (saldos.rows.length > 0) {
        const enMembresia = await tx
          .select({ personId: memberships.personId })
          .from(memberships)
          .where(
            and(
              eq(memberships.clubId, clubId),
              inArray(memberships.accountId, saldos.rows.map((r) => r.account_id)),
              isNull(memberships.endedOn),
            ),
          )
        enMembresia.forEach((m) => personasConDeuda.add(m.personId))
      }
      const ids = [...personasConDeuda]
      if (filtros.conDeuda === 'si') conditions.push(inArray(persons.id, ids))
      else if (ids.length > 0) conditions.push(notInArray(persons.id, ids))
    }

    const rows = await tx
      .select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName, docNumber: persons.docNumber, memberNumber: persons.memberNumber, email: persons.email, phone: persons.phone, bornOn: persons.bornOn, status: persons.status, categoria: teams.label, deporte: teams.sport })
      .from(persons)
      .leftJoin(
        teamMembers,
        and(eq(teamMembers.personId, persons.id), or(isNull(teamMembers.validTo), gte(teamMembers.validTo, hoy))),
      )
      .leftJoin(teams, eq(teams.id, teamMembers.teamId))
      .where(and(...conditions))
      .orderBy(asc(persons.lastName), asc(persons.firstName))

    const filas: FilaPersonaExport[] = rows.map((r) => ({
      apellido: r.lastName,
      nombre: r.firstName,
      documento: r.docNumber,
      nroSocio: r.memberNumber,
      email: r.email,
      telefono: r.phone,
      nacimiento: fmtFecha(r.bornOn),
      categoria: r.categoria,
      deporte: r.deporte,
      estado: r.status,
    }))

    let notas: NotaAuditoriaExport[] = []
    if (rows.length > 0) {
      const audit = await tx.execute<{ at: Date; action: string; entity: string; diff: Record<string, unknown> | null }>(
        sql`SELECT at, action, entity, diff FROM audit_log
            WHERE club_id = ${clubId} AND entity = 'persons'
              AND entity_id IN (${sql.join(rows.map((r) => r.id), sql`, `)})
            ORDER BY at DESC LIMIT 500`,
      )
      notas = audit.rows.map((a) => ({ at: fmtFechaHora(a.at), action: a.action, entity: a.entity, diff: a.diff as Record<string, unknown> | null }))
    }

    return { filas, notas }
  })
}

// ---------------------------------------------------------------------------
// Movimientos de cuota
// ---------------------------------------------------------------------------

export type FilaMovimientoExport = {
  fecha: string
  concepto: string
  montoCents: number
  direccion: 'credito' | 'debito'
  estado: string
  cuenta: string
  comprobante: string
}

type MovimientoRow = {
  id: string
  accountId: string
  bookedAt: Date
  amount: string
  direction: 'credito' | 'debito'
  memo: string | null
  chargeId: string | null
  paymentId: string | null
  reversesEntryId: string | null
  chargeConcept: string | null
  chargePeriod: string | null
  chargeStatus: string | null
  paymentMethod: string | null
  paymentStatus: string | null
  paymentExternalRef: string | null
  cuentaLabel: string | null
  holderNombre: string | null
  holderApellido: string | null
}

function fuenteYEstado(r: MovimientoRow): { fuente: string; estado: string; concepto: string; comprobante: string } {
  if (r.reversesEntryId) return { fuente: 'reversion', estado: 'reversion', concepto: r.memo ?? 'Reversión', comprobante: '' }
  if (r.paymentId) {
    return {
      fuente: 'pago',
      estado: r.paymentStatus ?? 'pago',
      concepto: r.memo ?? (r.paymentMethod ? `Pago ${r.paymentMethod}` : 'Pago'),
      comprobante: r.paymentExternalRef ?? '',
    }
  }
  if (r.chargeId) {
    return {
      fuente: 'cargo',
      estado: r.chargeStatus ?? 'cargo',
      concepto: r.chargeConcept ?? (r.chargePeriod ? `Cuota ${r.chargePeriod}` : 'Cargo'),
      comprobante: '',
    }
  }
  return { fuente: 'ajuste', estado: 'ajuste', concepto: r.memo ?? 'Ajuste', comprobante: '' }
}

export async function movimientosParaExportar(
  clubId: string,
  filtros: {
    desde?: string
    hasta?: string
    tipo?: 'cargo' | 'pago' | 'ajuste' | 'reversion' | null
    estado?: string | null
    categoria?: string | null
    accountId?: string | null
  },
): Promise<{ filas: FilaMovimientoExport[]; mandadoALaCaja: { debitoCents: number; creditoCents: number } }> {
  return withTenant(clubId, async ({ tx }) => {
    const conditions: SQL[] = [eq(ledgerEntries.clubId, clubId)]
    if (filtros.accountId) conditions.push(eq(ledgerEntries.accountId, filtros.accountId))

    let desde: string | undefined
    let hasta: string | undefined
    if (filtros.desde) desde = new Date(filtros.desde).toISOString()
    if (filtros.hasta) {
      const h = new Date(filtros.hasta)
      h.setUTCDate(h.getUTCDate() + 1)
      hasta = h.toISOString()
    }
    if (desde) conditions.push(sql`${ledgerEntries.bookedAt} >= ${desde}::timestamptz`)
    if (hasta) conditions.push(sql`${ledgerEntries.bookedAt} < ${hasta}::timestamptz`)

    const rows = await tx.execute<MovimientoRow>(
      sql`
        SELECT
          ledger_entries.id,
          ledger_entries.account_id AS "accountId",
          ledger_entries.booked_at AS "bookedAt",
          ledger_entries.amount,
          ledger_entries.direction,
          ledger_entries.memo,
          ledger_entries.charge_id AS "chargeId",
          ledger_entries.payment_id AS "paymentId",
          ledger_entries.reverses_entry_id AS "reversesEntryId",
          ch.concept AS "chargeConcept", ch.period AS "chargePeriod", ch.status AS "chargeStatus",
          p.method AS "paymentMethod", p.status AS "paymentStatus", p.external_ref AS "paymentExternalRef",
          a.label AS "cuentaLabel", ph.first_name AS "holderNombre", ph.last_name AS "holderApellido"
        FROM ledger_entries
        LEFT JOIN charges ch ON ch.id = ledger_entries.charge_id
        LEFT JOIN payments p ON p.id = ledger_entries.payment_id
        LEFT JOIN accounts a ON a.id = ledger_entries.account_id
        LEFT JOIN persons ph ON ph.id = a.holder_person_id
        WHERE ${sql.join(conditions, sql` AND `)}
        ORDER BY ledger_entries.booked_at ASC, ledger_entries.id ASC
      `,
    )

    let filas = rows.rows.map((r) => {
      const { fuente, estado, concepto, comprobante } = fuenteYEstado(r)
      return {
        fecha: fmtFechaHora(r.bookedAt),
        concepto,
        montoCents: decimalToCents(r.amount),
        direccion: r.direction,
        estado,
        cuenta: [r.holderApellido, r.holderNombre].filter(Boolean).join(' ') + (r.cuentaLabel ? ` · ${r.cuentaLabel}` : ''),
        comprobante,
        _accountId: r.accountId,
        _fuente: fuente,
      }
    })

    if (filtros.tipo) {
      filas = filas.filter((f) => f._fuente === filtros.tipo)
    }
    if (filtros.estado) {
      filas = filas.filter((f) => f.estado === filtros.estado)
    }
    // La categoria filtra por teamMembers del titular de la cuenta; es un
    // filtro por familia (la cuenta es del grupo familiar).
    if (filtros.categoria) {
      const accountIds = await tx
        .select({ accountId: memberships.accountId })
        .from(memberships)
        .innerJoin(teamMembers, eq(teamMembers.personId, memberships.personId))
        .where(and(eq(teamMembers.clubId, clubId), eq(teamMembers.teamId, filtros.categoria)))
      const ids = new Set(accountIds.map((m) => m.accountId))
      filas = filas.filter((f) => ids.has(f._accountId))
    }

    const sinFuente = filas.map((f) => ({
      fecha: f.fecha,
      concepto: f.concepto,
      montoCents: f.montoCents,
      direccion: f.direccion,
      estado: f.estado,
      cuenta: f.cuenta,
      comprobante: f.comprobante,
    }))
    const mandadoALaCaja = sinFuente.reduce(
      (acc, f) => {
        if (f.direccion === 'debito') acc.debitoCents += f.montoCents
        else acc.creditoCents += f.montoCents
        return acc
      },
      { debitoCents: 0, creditoCents: 0 },
    )

    return { filas: sinFuente, mandadoALaCaja }
  })
}

// ---------------------------------------------------------------------------
// Estado de cuenta de familia
// ---------------------------------------------------------------------------

export type EstadoCuentaExport = {
  resumen: { cuentaLabel: string | null; titular: string; balanceCents: number; fecha: string }
  movimientos: FilaMovimientoExport[]
  proximasCuotas: { period: string; concepto: string; vence: string; montoCents: number; saldoCents: number }[]
}

export async function estadoCuentaParaExportar(
  clubId: string,
  accountId: string,
  filtros: { desde?: string; hasta?: string },
): Promise<EstadoCuentaExport | null> {
  return withTenant(clubId, async ({ tx }) => {
    const [cuenta] = await tx
      .select({ id: accounts.id, label: accounts.label, holderNombre: persons.firstName, holderApellido: persons.lastName })
      .from(accounts)
      .innerJoin(persons, eq(persons.id, accounts.holderPersonId))
      .where(and(eq(accounts.clubId, clubId), eq(accounts.id, accountId), isNull(accounts.deletedAt)))
      .limit(1)
    if (!cuenta) return null

    const [saldos] = (await tx.execute<{ balance: string }>(sql`SELECT balance FROM account_balances WHERE account_id = ${accountId}`)).rows
    const balanceCents = decimalToCents(saldos?.balance ?? '0')

    const mov = await movimientosParaExportar(clubId, { desde: filtros.desde, hasta: filtros.hasta, accountId })
    const movimientos = mov.filas

    const cargos = await tx
      .select({
        period: charges.period,
        concept: charges.concept,
        dueOn: charges.dueOn,
        amount: charges.amount,
        id: charges.id,
      })
      .from(charges)
      .where(and(eq(charges.clubId, clubId), eq(charges.accountId, accountId), inArray(charges.status, ['pendiente', 'parcial', 'vencido'])))
      .orderBy(asc(charges.dueOn))

    const creditos = new Map<string, number>()
    if (cargos.length > 0) {
      const cred = await tx
        .select({ chargeId: ledgerEntries.chargeId, total: sql<string>`COALESCE(SUM(${ledgerEntries.amount}), 0)` })
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.clubId, clubId),
            eq(ledgerEntries.direction, 'credito'),
            inArray(ledgerEntries.chargeId, cargos.map((c) => c.id)),
            isNull(ledgerEntries.reversesEntryId),
          ),
        )
        .groupBy(ledgerEntries.chargeId)
      cred.forEach((r) => creditos.set(r.chargeId!, decimalToCents(r.total)))
    }

    return {
      resumen: {
        cuentaLabel: cuenta.label,
        titular: `${cuenta.holderNombre} ${cuenta.holderApellido}`,
        balanceCents,
        fecha: fmtFechaHora(new Date()),
      },
      movimientos,
      proximasCuotas: cargos.map((c) => {
        const amountCents = decimalToCents(c.amount)
        const saldoCents = Math.max(0, amountCents - (creditos.get(c.id) ?? 0))
        return { period: c.period, concepto: c.concept, vence: fmtFecha(c.dueOn), montoCents: amountCents, saldoCents }
      }),
    }
  })
}

export type { Tx }