import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { withTenant } from '@/db/tenant'
import { accounts, clubs, payments, persons } from '@/db/schema'
import { decimalToCents } from '@/lib/money'
import { buscarPersonas } from '@/modules/personas/queries'
import { listarCategorias } from '@/modules/categorias/queries'
import { listarPlanesVigentes, listarCuentasConSaldo } from '@/modules/cuotas/queries'
import { listarEventos } from '@/modules/eventos/queries'
import { cajaDelDia } from '@/modules/cobranzas/queries'
import { resumenMorosidad } from '@/modules/morosidad/queries'
import { resumenDocumentos } from '@/modules/documentos/queries'

export function rangoDiaLocal(timezone: string, ahora = new Date()): { desde: Date; hasta: Date } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const [y, m, d] = fmt.format(ahora).split('-').map(Number)
  return {
    desde: new Date(Date.UTC(y, m - 1, d)),
    hasta: new Date(Date.UTC(y, m - 1, d + 1)),
  }
}

export type PagoReciente = {
  id: string
  montoCents: number
  paidAt: Date
  method: string
  status: string
  holderNombre: string
  holderApellido: string
  cuentaLabel: string | null
}

/** Últimos pagos acreditados del club (para "cobrado recientemente"). */
export async function pagosRecientes(clubId: string, limit = 6): Promise<PagoReciente[]> {
  return withTenant(clubId, async ({ tx }) => {
    const rows = await tx
      .select({
        id: payments.id,
        amount: payments.amount,
        paidAt: payments.paidAt,
        method: payments.method,
        status: payments.status,
        holderNombre: persons.firstName,
        holderApellido: persons.lastName,
        cuentaLabel: accounts.label,
      })
      .from(payments)
      .innerJoin(accounts, eq(accounts.id, payments.accountId))
      .innerJoin(persons, eq(persons.id, accounts.holderPersonId))
      .where(
        and(
          eq(payments.clubId, clubId),
          eq(payments.status, 'acreditado'),
          isNull(accounts.deletedAt),
        ),
      )
      .orderBy(desc(payments.paidAt))
      .limit(limit)
    return rows.map((r) => ({ ...r, montoCents: decimalToCents(r.amount) }))
  })
}

export type CuentaDeudora = {
  accountId: string
  holderNombre: string
  holderApellido: string
  label: string | null
  balanceCents: number
}

/** Cuentas con saldo deudor, ordenadas por mayor deuda (sin límite de top). */
export async function cuentasDeudoras(clubId: string, top?: number): Promise<CuentaDeudora[]> {
  return withTenant(clubId, async ({ tx }) => {
    const cuentas = await tx
      .select({
        accountId: accounts.id,
        label: accounts.label,
        holderNombre: persons.firstName,
        holderApellido: persons.lastName,
      })
      .from(accounts)
      .innerJoin(persons, eq(persons.id, accounts.holderPersonId))
      .where(and(eq(accounts.clubId, clubId), isNull(accounts.deletedAt)))
      .orderBy(asc(persons.lastName))

    if (cuentas.length === 0) return []
    const ids = cuentas.map((c) => c.accountId)
    const saldos = await tx.execute<{ account_id: string; balance: string }>(
      sql`SELECT account_id, balance FROM account_balances WHERE account_id IN (${sql.join(ids, sql`, `)})`,
    )
    const porId = new Map(saldos.rows.map((r) => [r.account_id, decimalToCents(r.balance)]))
    const list = cuentas
      .map((c) => ({ ...c, balanceCents: porId.get(c.accountId) ?? 0 }))
      .filter((c) => c.balanceCents > 0)
      .sort((a, b) => b.balanceCents - a.balanceCents)
    return typeof top === 'number' ? list.slice(0, top) : list
  })
}

export type EventoResumen = {
  id: string
  title: string | null
  kind: string
  startsAt: Date
  location: string | null
  categoriaLabel: string | null
}

export type DashboardResumen = {
  timezone: string
  clubName: string
  logoUrl: string | null
  primary: string | null
  personasActivas: number
  personasTotales: number
  categoriasActivas: number
  deudaTotalCents: number
  cuentasDeudorasCount: number
  cobradoHoyCents: number
  cobrosHoyCount: number
  proximosEventos: EventoResumen[]
  documentosPendientes: number
  documentosVencidos: number
  documentosVigentes: number
  planesVigentes: number
  topDeudores: CuentaDeudora[]
  morosidad: {
    tramos: Record<'1' | '2' | '3' | '4', { cuentas: number; montoCents: number }>
    evolucion: { mes: string; deudaCents: number }[]
  } | null
  pagosRecientes: PagoReciente[]
}

export type PermisosDashboard = {
  verPersonas: boolean
  verCategorias: boolean
  verCuotas: boolean
  verCobranzas: boolean
  verCalendario: boolean
  verMorosidad: boolean
  verDocumentos: boolean
}

export type CargarDashboardOpts = {
  slug: string
  permisos: PermisosDashboard
}

/**
 * Arma todo el resumen del dashboard para el club. Cada query se corre
 * solo si el actor tiene el permiso. Devuelve el club (leído directo,
 * sin RLS) para el branding y timezone.
 */
export async function cargarDashboard(opts: CargarDashboardOpts): Promise<DashboardResumen | null> {
  const { slug, permisos } = opts

  const [club] = await db
    .select()
    .from(clubs)
    .where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)))
    .limit(1)
  if (!club) return null

  const { desde, hasta } = rangoDiaLocal(club.timezone)

  const [
    personas,
    categorias,
    planes,
    cuentas,
    eventos,
    cobrosHoy,
  ] = await Promise.all([
    permisos.verPersonas
      ? buscarPersonas(club.id, {})
      : Promise.resolve([]),
    permisos.verCategorias
      ? listarCategorias(club.id, { soloActivas: true })
      : Promise.resolve([]),
    permisos.verCuotas
      ? listarPlanesVigentes(club.id)
      : Promise.resolve([]),
    permisos.verCuotas
      ? listarCuentasConSaldo(club.id)
      : Promise.resolve([]),
    permisos.verCalendario
      ? listarEventos(club.id)
      : Promise.resolve([]),
    permisos.verCobranzas
      ? cajaDelDia(club.id, desde, hasta)
      : Promise.resolve([]),
  ])

  const [docResumen, morosidad, deudores, pagosRecent] = await Promise.all([
    permisos.verDocumentos ? resumenDocumentos(club.id) : Promise.resolve(null),
    permisos.verMorosidad ? resumenMorosidad(club.id) : Promise.resolve(null),
    permisos.verCuotas ? cuentasDeudoras(club.id, 5) : Promise.resolve([]),
    permisos.verCobranzas ? pagosRecientes(club.id, 6) : Promise.resolve([]),
  ])

  const personasActivas = personas.filter((p) => p.status === 'activo').length
  const deudaTotalCents = cuentas.reduce(
    (acc, c) => acc + Math.max(0, c.balanceCents),
    0,
  )
  const cuentasDeudorasCount = cuentas.filter((c) => c.balanceCents > 0).length
  const cobradoHoyCents = cobrosHoy.reduce((acc, c) => acc + c.montoCents, 0)

  return {
    timezone: club.timezone,
    clubName: club.name,
    logoUrl: club.logoUrl,
    primary: club.branding?.primary ?? null,
    personasActivas,
    personasTotales: personas.length,
    categoriasActivas: categorias.length,
    deudaTotalCents,
    cuentasDeudorasCount,
    cobradoHoyCents,
    cobrosHoyCount: cobrosHoy.length,
    proximosEventos: eventos.slice(0, 4).map((e) => ({
      id: e.id,
      title: e.title,
      kind: e.kind,
      startsAt: e.startsAt,
      location: e.location,
      categoriaLabel: e.categoriaLabel,
    })),
    documentosPendientes: docResumen?.pendientes ?? 0,
    documentosVencidos: docResumen?.vencidos ?? 0,
    documentosVigentes: docResumen?.vigentes ?? 0,
    planesVigentes: planes.length,
    topDeudores: deudores,
    morosidad: morosidad
      ? {
          tramos: morosidad.tramos,
          evolucion: morosidad.evolucionMensual,
        }
      : null,
    pagosRecientes: pagosRecent,
  }
}
