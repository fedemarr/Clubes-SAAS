import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { withTenant } from '@/db/tenant'
import { clubs } from '@/db/schema'
import { decimalToCents } from '@/lib/money'

/**
 * Queries del Super Admin (M9): globales (sin RLS) para clubs/users/
 * super_admin_log, + métricas por club que sí pasan por withTenant(clubId)
 * porque persons/accounts/charges tienen RLS forzado.
 */

export type ClubConMetricas = {
  id: string
  slug: string
  name: string
  locality: string | null
  logoUrl: string | null
  timezone: string
  primary: string | null
  createdAt: Date
  deletedAt: Date | null
  sociosActivos: number
  personasTotales: number
  deudaTotalCents: number
  cuentasDeudoras: number
  lastActivityAt: Date | null
}

async function metricasDelClub(clubId: string) {
  return withTenant(clubId, async ({ tx }) => {
    const [saldos, ultimo] = await Promise.all([
      tx.execute<{ balance: string }>(sql`SELECT balance FROM account_balances WHERE club_id = ${clubId}`),
      tx.execute<{ at: Date }>(sql`
        SELECT MAX(at) AS at FROM audit_log WHERE club_id = ${clubId}
      `),
    ])

    // Total y activos de persons — SQL crudo porque count(*) con el builder
    // tipado de Drizzle sobre FORCED RLS anda igual pero es más claro acá.
    const pRows = await tx.execute<{ status: string; n: string }>(sql`
      SELECT status, COUNT(*)::text AS n
      FROM persons WHERE club_id = ${clubId} AND deleted_at IS NULL
      GROUP BY status
    `)
    const porStatus = new Map(pRows.rows.map((r) => [r.status, Number(r.n)]))
    const total = [...porStatus.values()].reduce((a, b) => a + b, 0)
    const activos = porStatus.get('activo') ?? 0

    let deudaTotalCents = 0
    let cuentasDeudoras = 0
    for (const r of saldos.rows) {
      const cents = decimalToCents(r.balance)
      if (cents > 0) {
        deudaTotalCents += cents
        cuentasDeudoras += 1
      }
    }

    return {
      sociosActivos: activos,
      personasTotales: total,
      deudaTotalCents,
      cuentasDeudoras,
      lastActivityAt: ultimo.rows[0]?.at ?? null,
    }
  })
}

/** Lista de clubs (global, sin RLS) + métricas calculadas por club. */
export async function listarClubsConMetricas(): Promise<ClubConMetricas[]> {
  const allClubs = await db.select().from(clubs).orderBy(asc(clubs.name))
  return Promise.all(
    allClubs.map(async (c) => {
      const m = await metricasDelClub(c.id)
      return {
        id: c.id,
        slug: c.slug,
        name: c.name,
        locality: c.locality,
        logoUrl: c.logoUrl,
        timezone: c.timezone,
        primary: c.branding?.primary ?? null,
        createdAt: c.createdAt,
        deletedAt: c.deletedAt,
        ...m,
      }
    }),
  )
}

export type RegistroAuditoria = {
  id: string
  actorEmail: string
  action: string
  entity: string
  entityId: string | null
  diff: Record<string, unknown> | null
  ip: string | null
  at: Date
}

export type FiltroAuditoria = {
  entity?: string
  search?: string
  limit?: number
}

/** Auditoría global de super admin, con filtros y orden por fecha. */
export async function listarAuditoriaSuperAdmin(filtro: FiltroAuditoria = {}): Promise<RegistroAuditoria[]> {
  const limit = filtro.limit ?? 100
  const conds: string[] = []
  if (filtro.entity) conds.push(`entity = '${filtro.entity.replace(/'/g, "''")}'`)
  if (filtro.search) {
    const s = filtro.search.replace(/'/g, "''")
    conds.push(`(actor_email ILIKE '%${s}%' OR cast(entity_id as text) ILIKE '%${s}%')`)
  }
  const where = conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : ''

  const rows = await db.execute<{
    id: string
    actor_email: string
    action: string
    entity: string
    entity_id: string | null
    diff: Record<string, unknown> | null
    ip: string | null
    at: Date
  }>(sql`
    SELECT id, actor_email, action, entity, entity_id, diff, ip, at
    FROM super_admin_log
    ${sql.raw(where)}
    ORDER BY at DESC
    LIMIT ${limit}
  `)
  return rows.rows.map((r) => ({
    id: r.id,
    actorEmail: r.actor_email,
    action: r.action,
    entity: r.entity,
    entityId: r.entity_id,
    diff: r.diff as Record<string, unknown> | null,
    ip: r.ip,
    at: new Date(r.at),
  }))
}

/** Auditoría estructural de un club (audit_log, tenant-scoped) para drill-down. */
export async function auditoriaDelClub(clubId: string, limit = 100) {
  return withTenant(clubId, async ({ tx }) => {
    const rows = await tx.execute<{
      id: string
      entity: string
      entity_id: string | null
      action: string
      diff: Record<string, unknown> | null
      ip: string | null
      at: Date
    }>(sql`
      SELECT id, entity, entity_id, action, diff, ip, at
      FROM audit_log WHERE club_id = ${clubId}
      ORDER BY at DESC LIMIT ${limit}
    `)
    return rows.rows.map((r) => ({
      id: r.id,
      entity: r.entity,
      entityId: r.entity_id,
      action: r.action,
      diff: r.diff,
      ip: r.ip,
      at: new Date(r.at),
    }))
  })
}

/** Planes de cuota de un club (fee_plans, tenant-scoped). */
export async function planesDelClub(clubId: string) {
  return withTenant(clubId, async ({ tx }) => {
    const rows = await tx.execute<{
      id: string
      name: string
      sport: string | null
      amount: string
      valid_from: string
      valid_to: string | null
      created_at: Date
    }>(sql`
      SELECT fp.id, fp.name, fp.sport, fp.amount, fp.valid_from, fp.valid_to, fp.created_at
      FROM fee_plans fp
      WHERE fp.club_id = ${clubId}
      ORDER BY fp.sport ASC NULLS LAST, fp.name ASC
    `)
    return rows.rows.map((r) => ({ ...r, amountCents: decimalToCents(r.amount) }))
  })
}

/** Categorías (teams) de un club. */
export async function categoriasDelClub(clubId: string) {
  return withTenant(clubId, async ({ tx }) => {
    const rows = await tx.execute<{
      id: string
      sport: string
      label: string
      season: number
      birth_year_from: number | null
      birth_year_to: number | null
      is_active: boolean
      jugadores: number
    }>(sql`
      SELECT t.id, t.sport, t.label, t.season, t.birth_year_from, t.birth_year_to, t.is_active,
             (SELECT count(*)::int FROM team_members tm WHERE tm.team_id = t.id AND tm.valid_to IS NULL) AS jugadores
      FROM teams t
      WHERE t.club_id = ${clubId} AND t.deleted_at IS NULL
      ORDER BY t.sport, t.label
    `)
    return rows.rows
  })
}

/** Staff (personas con person_role staff) de un club. */
export async function staffDelClub(clubId: string) {
  return withTenant(clubId, async ({ tx }) => {
    const rows = await tx.execute<{
      role: string
      valid_from: string
      valid_to: string | null
      first_name: string
      last_name: string
      email: string | null
      user_email: string | null
    }>(sql`
      SELECT pr.role, pr.valid_from, pr.valid_to, p.first_name, p.last_name, p.email, u.email AS user_email
      FROM person_roles pr
      JOIN persons p ON p.id = pr.person_id
      LEFT JOIN users u ON u.id = p.user_id
      WHERE pr.club_id = ${clubId}
        AND pr.role IN ('presidente', 'secretaria', 'tesorero', 'coordinador', 'entrenador', 'manager')
        AND (pr.valid_to IS NULL OR pr.valid_to >= current_date)
      ORDER BY pr.role, p.last_name
    `)
    return rows.rows
  })
}

/** El club (global, sin RLS) por slug — sin los campos internos del tenant. */
export async function obtenerClubParaEdicion(slug: string) {
  const [club] = await db
    .select()
    .from(clubs)
    .where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)))
    .limit(1)
  return club
}