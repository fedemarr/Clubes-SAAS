import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { withTenant } from '@/db/tenant'
import { accounts, charges, feePlans, memberships, persons, relationships } from '@/db/schema'
import { decimalToCents } from '@/lib/money'
import { diasDesde, mesesEntre, tramoAntiguedad, avancePlan, planDePago } from './service'
import type { ContactoReciente, ReglaCobranza } from './service'
import type { TramoAntiguedad } from './service'

export type DeudorMorosidad = {
  accountId: string
  label: string | null
  holderNombre: string
  holderApellido: string
  deudaCents: number
  vencimientoMasViejo: string | null
  diasDesdeVencimiento: number
  tramo: TramoAntiguedad
  deportes: string[]
  destino: {
    userId: string | null
    nombre: string
    apellido: string
    email: string | null
    phone: string | null
  } | null
}

export type FiltroMorosidad = {
  deporte?: string
  tramo?: TramoAntiguedad
  minCents?: number
  maxCents?: number
  top?: number
}

function esMenor(bornOn: string | null, hoy = new Date()): boolean {
  if (!bornOn) return false
  const [y, m, d] = bornOn.split('-').map(Number)
  const mayor = new Date(Date.UTC(y + 18, m - 1, d))
  return mayor.getTime() > hoy.getTime()
}

/**
 * Todos los deudores del club (saldo > 0) con su antigüedad, deportes y el
 * tutor pagador al que van los mensajes (jamás al menor). Es la fuente del
 * panel y del motor de reglas.
 */
export async function deudoresMorosidad(clubId: string, filtros: FiltroMorosidad = {}): Promise<DeudorMorosidad[]> {
  return withTenant(clubId, async ({ tx }) => {
    const saldos = await tx.execute<{ account_id: string; balance: string }>(
      sql`SELECT account_id, balance FROM account_balances WHERE club_id = ${clubId}`,
    )
    const deudaPorCuenta = new Map(
      saldos.rows.map((r) => [r.account_id, decimalToCents(r.balance)] as const),
    )
    const deudoras = [...deudaPorCuenta.entries()]
      .filter(([, cents]) => cents > 0)
      .map(([accountId]) => accountId)
    if (deudoras.length === 0) return []

    const cuentas = await tx
      .select({
        id: accounts.id,
        label: accounts.label,
        holderPersonId: accounts.holderPersonId,
        holderNombre: persons.firstName,
        holderApellido: persons.lastName,
        holderBornOn: persons.bornOn,
        holderUserId: persons.userId,
        holderEmail: persons.email,
        holderPhone: persons.phone,
      })
      .from(accounts)
      .innerJoin(persons, eq(persons.id, accounts.holderPersonId))
      .where(and(eq(accounts.clubId, clubId), inArray(accounts.id, deudoras), isNull(accounts.deletedAt)))

    // Cargo abierto más viejo por cuenta (marca la antigüedad de la deuda).
    const abiertos = await tx
      .select({ accountId: charges.accountId, dueOn: charges.dueOn })
      .from(charges)
      .where(
        and(
          eq(charges.clubId, clubId),
          inArray(charges.accountId, deudoras),
          inArray(charges.status, ['pendiente', 'parcial', 'vencido']),
        ),
      )
    const masViejo = new Map<string, string>()
    for (const c of abiertos) {
      const actual = masViejo.get(c.accountId)
      if (!actual || c.dueOn < actual) masViejo.set(c.accountId, c.dueOn)
    }

    // Deportes por cuenta (vía membresías → plan).
    const mems = await tx
      .select({ accountId: memberships.accountId, sport: feePlans.sport })
      .from(memberships)
      .innerJoin(feePlans, eq(feePlans.id, memberships.feePlanId))
      .where(
        and(
          eq(memberships.clubId, clubId),
          inArray(memberships.accountId, deudoras),
          eq(memberships.status, 'activa'),
        ),
      )
    const deportesPorCuenta = new Map<string, string[]>()
    for (const m of mems) {
      if (!m.sport) continue
      const arr = deportesPorCuenta.get(m.accountId) ?? []
      if (!arr.includes(m.sport)) {
        arr.push(m.sport)
        deportesPorCuenta.set(m.accountId, arr)
      }
    }

    // Tutores activos de menores, para resolver el destino si el titular es menor.
    const tutores = await tx
      .select({
        accountId: accounts.id,
        userId: persons.userId,
        nombre: persons.firstName,
        apellido: persons.lastName,
        email: persons.email,
        phone: persons.phone,
      })
      .from(accounts)
      .innerJoin(relationships, eq(relationships.relatedPersonId, accounts.holderPersonId))
      .innerJoin(persons, eq(persons.id, relationships.personId))
      .where(
        and(
          eq(accounts.clubId, clubId),
          eq(relationships.kind, 'tutor_de'),
          inArray(accounts.id, deudoras),
        ),
      )

    const tutorPorCuenta = new Map(tutores.map((t) => [t.accountId, t]))

    const hoy = new Date()
    const deporte = filtros.deporte?.trim()
    const tramo = filtros.tramo

    const lista: DeudorMorosidad[] = []
    for (const c of cuentas) {
      const deudaCents = deudaPorCuenta.get(c.id) ?? 0
      const vencimientoMasViejo = masViejo.get(c.id) ?? null
      const dias = vencimientoMasViejo ? diasDesde(vencimientoMasViejo, hoy) : 0
      const meses = vencimientoMasViejo ? mesesEntre(vencimientoMasViejo, hoy) : 0
      const t = tramoAntiguedad(meses)
      const deportes = deportesPorCuenta.get(c.id) ?? []
      if (deporte && !deportes.includes(deporte)) continue
      if (tramo && t !== tramo) continue
      if (filtros.minCents !== undefined && deudaCents < filtros.minCents) continue
      if (filtros.maxCents !== undefined && deudaCents > filtros.maxCents) continue

      let destino: DeudorMorosidad['destino'] = null
      if (esMenor(c.holderBornOn, hoy)) {
        const t = tutorPorCuenta.get(c.id)
        if (t) destino = { userId: t.userId, nombre: t.nombre, apellido: t.apellido, email: t.email, phone: t.phone }
      } else if (c.holderUserId || c.holderEmail || c.holderPhone) {
        destino = {
          userId: c.holderUserId,
          nombre: c.holderNombre,
          apellido: c.holderApellido,
          email: c.holderEmail,
          phone: c.holderPhone,
        }
      }

      lista.push({
        accountId: c.id,
        label: c.label,
        holderNombre: c.holderNombre,
        holderApellido: c.holderApellido,
        deudaCents,
        vencimientoMasViejo,
        diasDesdeVencimiento: dias,
        tramo: t,
        deportes,
        destino,
      })
    }

    lista.sort((a, b) => b.deudaCents - a.deudaCents)
    return typeof filtros.top === 'number' ? lista.slice(0, filtros.top) : lista
  })
}

export type ResumenMorosidad = {
  deudaTotalCents: number
  cuentasDeudoras: number
  tramos: Record<TramoAntiguedad, { cuentas: number; montoCents: number }>
  porDeporte: { deporte: string; montoCents: number; cuentas: number }[]
  evolucionMensual: { mes: string; deudaCents: number }[]
  top20: DeudorMorosidad[]
}

export async function resumenMorosidad(clubId: string): Promise<ResumenMorosidad> {
  const todos = await deudoresMorosidad(clubId)
  const hoyISO = new Date().toISOString().slice(0, 10)

  const tramos: ResumenMorosidad['tramos'] = {
    1: { cuentas: 0, montoCents: 0 },
    2: { cuentas: 0, montoCents: 0 },
    3: { cuentas: 0, montoCents: 0 },
    4: { cuentas: 0, montoCents: 0 },
  }
  for (const d of todos) {
    tramos[d.tramo].cuentas += 1
    tramos[d.tramo].montoCents += d.deudaCents
  }

  const porDeporteMap = new Map<string, { montoCents: number; cuentas: number }>()
  for (const d of todos) {
    for (const s of d.deportes) {
      const actual = porDeporteMap.get(s) ?? { montoCents: 0, cuentas: 0 }
      actual.montoCents += d.deudaCents
      actual.cuentas += 1
      porDeporteMap.set(s, actual)
    }
  }
  const porDeporte = [...porDeporteMap.entries()]
    .map(([deporte, v]) => ({ deporte, ...v }))
    .sort((a, b) => b.montoCents - a.montoCents)

  const evolucionMensual = await withTenant(clubId, async ({ tx }) => {
    const rows = await tx.execute<{ mes: string; deuda: string }>(sql`
      WITH mensual AS (
        SELECT account_id, date_trunc('month', booked_at) AS mes,
               SUM(CASE WHEN direction = 'debito' THEN amount ELSE -amount END) AS delta
        FROM ledger_entries
        WHERE club_id = ${clubId} AND booked_at >= now() - interval '13 months'
        GROUP BY account_id, 2
      ), bal AS (
        SELECT account_id, mes,
               SUM(delta) OVER (PARTITION BY account_id ORDER BY mes) AS balance
        FROM mensual
      )
      SELECT to_char(mes, 'YYYY-MM') AS mes, COALESCE(SUM(balance) FILTER (WHERE balance > 0), 0) AS deuda
      FROM bal GROUP BY mes ORDER BY mes
    `)
    const serie = rows.rows.map((r) => ({ mes: r.mes, deudaCents: decimalToCents(r.deuda) }))
    if (serie.length > 1) {
      // Ancla la serie a la deuda real de hoy para no arrastrar el corte de 13 meses.
      const real = todos.reduce((acc, d) => acc + d.deudaCents, 0)
      const ajuste = (real - serie[serie.length - 1].deudaCents) / (serie.length - 1)
      for (const s of serie) s.deudaCents += Math.round(ajuste)
    }
    return serie.filter((s) => s.mes <= hoyISO.slice(0, 7))
  })

  return {
    deudaTotalCents: todos.reduce((acc, d) => acc + d.deudaCents, 0),
    cuentasDeudoras: todos.length,
    tramos,
    porDeporte,
    evolucionMensual,
    top20: todos.slice(0, 20),
  }
}

// ---------------------------------------------------------------------------
// M5.2 · Configuración (tablas que viven en rls.sql, no en schema.ts)
// ---------------------------------------------------------------------------

type ReglaRow = {
  id: string
  name: string
  dias_desde_vencimiento: number
  channel: ReglaCobranza['channel']
  template_key: string | null
  dedupe_dias: number
  enabled: boolean
}

export async function listarReglasCobranza(clubId: string): Promise<ReglaCobranza[]> {
  return withTenant(clubId, async ({ tx }) => {
    const rows = await tx.execute<ReglaRow>(
      sql`SELECT id, name, dias_desde_vencimiento, channel, template_key, dedupe_dias, enabled
          FROM cobranza_rules WHERE club_id = ${clubId} ORDER BY dias_desde_vencimiento ASC`,
    )
    return rows.rows.map((r) => ({
      id: r.id,
      name: r.name,
      dias: r.dias_desde_vencimiento,
      channel: r.channel,
      templateKey: r.template_key,
      dedupeDias: r.dedupe_dias,
      enabled: r.enabled,
    }))
  })
}

export type Plantilla = {
  id: string
  key: string
  name: string
  body: string
}

export async function listarPlantillas(clubId: string): Promise<Plantilla[]> {
  return withTenant(clubId, async ({ tx }) => {
    const rows = await tx.execute<{ id: string; key: string; name: string; body: string }>(
      sql`SELECT id, key, name, body FROM message_templates WHERE club_id = ${clubId} ORDER BY name`,
    )
    return rows.rows
  })
}

/** Mapa key → body, para que el motor renderice sin tocar la base. */
export async function plantillasPorKey(clubId: string): Promise<Record<string, string>> {
  const list = await listarPlantillas(clubId)
  const map: Record<string, string> = {}
  for (const p of list) map[p.key] = p.body
  return map
}

/**
 * Contactos de cobranza recientes de las cuentas dadas, para la dedupe del
 * motor ("máximo un mensaje por cuenta por semana", brief M5).
 */
export async function listarContactosRecientes(
  clubId: string,
  accountIds: string[],
  desde: Date,
): Promise<ContactoReciente[]> {
  if (accountIds.length === 0) return []
  return withTenant(clubId, async ({ tx }) => {
    const rows = await tx.execute<{ account_id: string; rule_id: string | null; channel: string; delivered_at: Date }>(
      sql`SELECT account_id, rule_id, channel, delivered_at
          FROM contact_log
          WHERE club_id = ${clubId} AND account_id IN (${sql.join(accountIds, sql`, `)}) AND delivered_at >= ${desde}`,
    )
    return rows.rows.map((r) => ({
      accountId: r.account_id,
      ruleId: r.rule_id,
      channel: r.channel,
      deliveredAt: new Date(r.delivered_at),
    }))
  })
}

export type SugerenciaPendiente = {
  id: string
  accountId: string
  holderApellido: string
  holderNombre: string
  deudaCents: number
  ruleName: string | null
  deliveredAt: Date
}

/** Sugerencias de suspensión abiertas (la suspensión NUNCA es automática). */
export async function listarSugerenciasPendientes(clubId: string): Promise<SugerenciaPendiente[]> {
  return withTenant(clubId, async ({ tx }) => {
    const rows = await tx.execute<SugerenciaPendiente & { balance: string }>(sql`
      SELECT cl.id, cl.account_id AS "accountId", cl.rule_name, cl.delivered_at AS "deliveredAt",
             p.last_name AS "holderApellido", p.first_name AS "holderNombre", bal.balance
      FROM (
        SELECT id, account_id, (SELECT name FROM cobranza_rules cr WHERE cr.id = cl.rule_id) AS rule_name, delivered_at
        FROM contact_log cl
        WHERE club_id = ${clubId} AND kind = 'sugerencia' AND resolved_at IS NULL
      ) cl
      JOIN accounts a ON a.id = cl.account_id
      JOIN persons p ON p.id = a.holder_person_id
      JOIN account_balances bal ON bal.account_id = cl.account_id
      ORDER BY cl.delivered_at ASC
    `)
    return rows.rows.map((r) => ({
      id: r.id,
      accountId: r.accountId,
      holderApellido: r.holderApellido,
      holderNombre: r.holderNombre,
      deudaCents: decimalToCents(r.balance),
      ruleName: r.ruleName,
      deliveredAt: new Date(r.deliveredAt),
    }))
  })
}

// ---------------------------------------------------------------------------
// M5.3 · Planes de pago
// ---------------------------------------------------------------------------

export type PlanDePago = {
  id: string
  accountId: string
  holderApellido: string
  holderNombre: string
  totalCents: number
  cantidadCuotas: number
  montoCuotaCents: number
  primeraFecha: string
  status: string
  motivo: string | null
  createdAt: Date
  pagadoDesdeInicioCents: number
  vencidas: number
  pagas: number
  restanteCents: number
}

export async function listarPlanesDePago(clubId: string): Promise<PlanDePago[]> {
  return withTenant(clubId, async ({ tx }) => {
    const rows = await tx.execute<{
      id: string
      account_id: string
      holderApellido: string
      holderNombre: string
      total: string
      cantidad_cuotas: number
      monto_cuota: string
      primera_fecha: string
      status: string
      motivo: string | null
      created_at: Date
      pagado: string
    }>(sql`
      SELECT pp.id, pp.account_id, p.last_name AS "holderApellido", p.first_name AS "holderNombre",
             pp.total, pp.cantidad_cuotas, pp.monto_cuota, pp.primera_fecha, pp.status, pp.motivo, pp.created_at,
             COALESCE(SUM(CASE WHEN le.direction = 'credito' THEN le.amount ELSE 0 END), 0) AS pagado
      FROM payment_plans pp
      JOIN accounts a ON a.id = pp.account_id
      JOIN persons p ON p.id = a.holder_person_id
      LEFT JOIN ledger_entries le ON le.account_id = pp.account_id AND le.booked_at >= pp.created_at
      WHERE pp.club_id = ${clubId}
      GROUP BY pp.id, p.last_name, p.first_name, a.holder_person_id, pp.total, pp.cantidad_cuotas,
               pp.monto_cuota, pp.primera_fecha, pp.status, pp.motivo, pp.created_at
      ORDER BY pp.created_at DESC
    `)
    const hoy = new Date().toISOString().slice(0, 10)
    return rows.rows.map((r) => {
      const pagadoDesdeInicioCents = decimalToCents(r.pagado)
      const cuotas = planDePago(decimalToCents(r.total), r.cantidad_cuotas, r.primera_fecha)
      const vencidas = cuotas.filter((c) => c.fecha <= hoy).length
      const avance = avancePlan({ cuotas, pagadoDesdeInicioCents })
      return {
        id: r.id,
        accountId: r.account_id,
        holderApellido: r.holderApellido,
        holderNombre: r.holderNombre,
        totalCents: decimalToCents(r.total),
        cantidadCuotas: r.cantidad_cuotas,
        montoCuotaCents: decimalToCents(r.monto_cuota),
        primeraFecha: r.primera_fecha,
        status: r.status,
        motivo: r.motivo,
        createdAt: new Date(r.created_at),
        pagadoDesdeInicioCents,
        vencidas,
        pagas: avance.pagas,
        restanteCents: avance.restanteCents,
      }
    })
  })
}

export type Coordinador = { userId: string; nombre: string; apellido: string; sport: string }

export type ContactoHistorial = {
  id: string
  accountId: string
  holderApellido: string
  holderNombre: string
  channel: string
  kind: 'mensaje' | 'aviso' | 'sugerencia'
  ruleName: string | null
  body: string | null
  deliveredAt: Date
  resolvedAt: Date | null
}

/**
 * Historial de contactos de cobranza (todo lo que el motor hizo, no solo
 * las sugerencias pendientes). Permite auditar qué se mandó, a quién y por
 * qué canal, y ver si una sugerencia ya fue resuelta.
 */
export async function historialContactos(clubId: string, opts: { limit?: number } = {}): Promise<ContactoHistorial[]> {
  const limit = opts.limit ?? 50
  return withTenant(clubId, async ({ tx }) => {
    const rows = await tx.execute<{
      id: string
      account_id: string
      holderApellido: string
      holderNombre: string
      channel: string
      kind: ContactoHistorial['kind']
      rule_name: string | null
      body: string | null
      delivered_at: Date
      resolved_at: Date | null
    }>(sql`
      SELECT cl.id, cl.account_id, p.last_name AS "holderApellido", p.first_name AS "holderNombre",
             cl.channel, cl.kind,
             (SELECT name FROM cobranza_rules cr WHERE cr.id = cl.rule_id) AS rule_name,
             cl.body, cl.delivered_at AS delivered_at, cl.resolved_at
      FROM contact_log cl
      JOIN accounts a ON a.id = cl.account_id
      JOIN persons p ON p.id = a.holder_person_id
      WHERE cl.club_id = ${clubId}
      ORDER BY cl.delivered_at DESC
      LIMIT ${limit}
    `)
    return rows.rows.map((r) => ({
      id: r.id,
      accountId: r.account_id,
      holderApellido: r.holderApellido,
      holderNombre: r.holderNombre,
      channel: r.channel,
      kind: r.kind,
      ruleName: r.rule_name,
      body: r.body,
      deliveredAt: new Date(r.delivered_at),
      resolvedAt: r.resolved_at ? new Date(r.resolved_at) : null,
    }))
  })
}

/**
 * Usuarios con rol coordinador, agrupados por deporte (el scope del rol es
 * un team del deporte). Los avisos de la regla channel='coordinador' van a
 * ellos, nunca al menor ni al deudor.
 */
export async function coordinadoresPorDeporte(clubId: string): Promise<Coordinador[]> {
  return withTenant(clubId, async ({ tx }) => {
    const rows = await tx.execute<{ user_id: string; nombre: string; apellido: string; sport: string }>(sql`
      SELECT p.user_id, p.first_name AS nombre, p.last_name AS apellido, t.sport
      FROM person_roles pr
      JOIN persons p ON p.id = pr.person_id
      JOIN teams t ON t.id = pr.scope_team_id
      WHERE pr.club_id = ${clubId}
        AND pr.role = 'coordinador'
        AND (pr.valid_to IS NULL OR pr.valid_to >= current_date)
        AND p.user_id IS NOT NULL
    `)
    return rows.rows.map((r) => ({ userId: r.user_id, nombre: r.nombre, apellido: r.apellido, sport: r.sport }))
  })
}
