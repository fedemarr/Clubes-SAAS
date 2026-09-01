'use server'

import { and, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { withTenant } from '@/db/tenant'
import { requireSuperAdmin, registrarAccionSuperAdmin } from '@/lib/super-admin'
import { crearCsv } from '@/lib/csv'
import { setearCookieImpersonacion, limpiarCookieImpersonacion } from '@/lib/impersonacion'
import { exportarAuditoriaSuperAdmin } from './queries'
import { normalizarSportPacks } from './schemas'

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

/** Normaliza a slug: minúsculas, sin acentos, espacios/símbolos → guión. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const clubGeralSchema = z.object({
  name: z.string().min(2).max(160),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, 'Slug inválido (solo minúsculas, números y guiones)'),
  locality: z.string().max(120).nullable().optional(),
  logoUrl: z.string().url().nullable().optional().or(z.literal('')),
  timezone: z.string().max(60).optional(),
  primary: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional().or(z.literal('')),
  secondary: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional().or(z.literal('')),
  tagline: z.string().max(200).nullable().optional(),
})

async function ipDeRequest(): Promise<string | null> {
  try {
    const h = await headers()
    return h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  } catch {
    return null
  }
}

async function confirmarSlugLibre(slug: string, excluirId?: string): Promise<boolean> {
  const rows = await db
    .select({ id: clubs.id })
    .from(clubs)
    .where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)))
  return rows.every((r) => r.id === excluirId)
}

/** Crea un club nuevo desde cero (solo super admin). */
export async function crearClub(input: unknown): Promise<ActionResult<{ id: string; slug: string }>> {
  const parsed = clubGeralSchema
    .pick({ name: true, slug: true, locality: true, logoUrl: true, timezone: true, primary: true, secondary: true, tagline: true })
    .safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const sa = await requireSuperAdmin()
  if (parsed.data.slug !== slugify(parsed.data.slug)) {
    return { ok: false, error: 'Slug inválido' }
  }
  if (!(await confirmarSlugLibre(parsed.data.slug))) {
    return { ok: false, error: 'Ya existe un club con ese slug' }
  }

  const [club] = await db
    .insert(clubs)
    .values({
      name: parsed.data.name,
      slug: parsed.data.slug,
      locality: parsed.data.locality ?? null,
      logoUrl: parsed.data.logoUrl || null,
      timezone: parsed.data.timezone ?? 'America/Argentina/Buenos_Aires',
      branding: {
        primary: parsed.data.primary || undefined,
        secondary: parsed.data.secondary || undefined,
        tagline: parsed.data.tagline || undefined,
      },
    })
    .returning()

  await registrarAccionSuperAdmin(
    sa.email,
    'create',
    'clubs',
    club.id,
    { slug: club.slug, name: club.name },
    await ipDeRequest(),
  )

  revalidatePath('/super-admin')
  return { ok: true, data: { id: club.id, slug: club.slug } }
}

/** Actualiza datos generales de un club existente (solo super admin). */
export async function actualizarClubGeneral(
  slug: string,
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = clubGeralSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const sa = await requireSuperAdmin()

  const [club] = await db.select().from(clubs).where(eq(clubs.slug, slug)).limit(1)
  if (!club) return { ok: false, error: 'No existe ese club' }

  if (parsed.data.slug !== slug) {
    if (!(await confirmarSlugLibre(parsed.data.slug, club.id))) {
      return { ok: false, error: 'Ya existe otro club con ese slug' }
    }
  }

  const antes = {
    name: club.name,
    slug: club.slug,
    locality: club.locality,
    logoUrl: club.logoUrl,
    timezone: club.timezone,
  }
  const branding = {
    primary: parsed.data.primary || club.branding?.primary,
    secondary: parsed.data.secondary || club.branding?.secondary,
    tagline: parsed.data.tagline || club.branding?.tagline,
  }

  await db
    .update(clubs)
    .set({
      name: parsed.data.name,
      slug: parsed.data.slug,
      locality: parsed.data.locality ?? null,
      logoUrl: parsed.data.logoUrl || null,
      timezone: parsed.data.timezone ?? club.timezone,
      branding: { primary: branding.primary, secondary: branding.secondary, tagline: branding.tagline },
      updatedAt: new Date(),
    })
    .where(eq(clubs.id, club.id))

  await registrarAccionSuperAdmin(
    sa.email,
    'update',
    'clubs',
    club.id,
    { antes, despues: { ...antes, name: parsed.data.name, slug: parsed.data.slug, locality: parsed.data.locality, logoUrl: parsed.data.logoUrl ?? null, timezone: parsed.data.timezone ?? club.timezone } },
    await ipDeRequest(),
  )

  revalidatePath('/super-admin')
  revalidatePath(`/super-admin/clubs/${slug}`)
  if (parsed.data.slug !== slug) revalidatePath(`/super-admin/clubs/${parsed.data.slug}`)
  return { ok: true, data: null }
}

/** Suspensión blanda: deletedAt. Reactivar = null. */
export async function setearSuspensionClub(
  slug: string,
  suspendido: boolean,
): Promise<ActionResult<null>> {
  const sa = await requireSuperAdmin()

  const [club] = await db.select().from(clubs).where(eq(clubs.slug, slug)).limit(1)
  if (!club) return { ok: false, error: 'No existe ese club' }

  await db
    .update(clubs)
    .set({ deletedAt: suspendido ? new Date() : null, updatedAt: new Date() })
    .where(eq(clubs.id, club.id))

  await registrarAccionSuperAdmin(
    sa.email,
    suspendido ? 'suspend' : 'unsuspend',
    'clubs',
    club.id,
    { slug: club.slug },
    await ipDeRequest(),
  )

  revalidatePath('/super-admin')
  revalidatePath(`/super-admin/clubs/${slug}`)
  return { ok: true, data: null }
}

/** Exporta toda la auditoría de super admin en CSV (solo SA). */
export async function exportarAuditoriaCsv(): Promise<ActionResult<string>> {
  const sa = await requireSuperAdmin()

  const registros = await exportarAuditoriaSuperAdmin()
  const filas: (string | number | null)[][] = [
    ['fecha_utc', 'actor', 'accion', 'entidad', 'entidad_id', 'club', 'detalle', 'ip'],
    ...registros.map((r) => [
      r.at.toISOString(),
      r.actorEmail,
      r.action,
      r.entity,
      r.entityId ?? '',
      r.clubSlug ?? '',
      JSON.stringify(r.diff ?? {}),
      r.ip ?? '',
    ]),
  ]

  await registrarAccionSuperAdmin(
    sa.email,
    'export',
    'super_admin_log',
    null,
    { rows: registros.length },
    await ipDeRequest(),
  )

  return { ok: true, data: crearCsv(filas) }
}

// ───────────────────────── Sport Packs (M13) ─────────────────────────

const sportPacksSchema = z.object({
  deportes: z
    .array(
      z.object({
        key: z
          .string()
          .min(1)
          .max(40)
          .regex(/^[a-z0-9]+$/, 'Clave inválida (solo minúsculas y números)'),
        label: z.string().min(1).max(40),
        posiciones: z.array(z.string().trim().min(1).max(40)).max(30),
        tiposPartido: z.array(z.string().trim().min(1).max(40)).max(10),
      }),
    )
    .max(20),
})

/**
 * Reemplaza el sport_pack JSONB de un club (solo SA). El JSON es un mapa
 * { [sportKey]: { label, posiciones[], tiposPartido[] } }.
 * La acción reemplaza el mapa entero, preservando keys desconocidas no
 * presentes en el input (aunque hoy el sistema solo usa estas).
 */
export async function guardarSportPacks(slug: string, input: unknown): Promise<ActionResult<null>> {
  const parsed = sportPacksSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const sa = await requireSuperAdmin()

  const [club] = await db.select().from(clubs).where(eq(clubs.slug, slug)).limit(1)
  if (!club) return { ok: false, error: 'No existe ese club' }

  const antes = normalizarSportPacks(club.sportPack)
  const deportes: Record<string, unknown> = {}
  for (const d of parsed.data.deportes) {
    deportes[d.key] = { label: d.label, posiciones: d.posiciones, tiposPartido: d.tiposPartido }
  }

  // Preservar keys no conocidas del JSONB original (si las hubiera).
  if (club.sportPack && typeof club.sportPack === 'object') {
    for (const [k, v] of Object.entries(club.sportPack)) {
      if (!(k in deportes)) deportes[k] = v
    }
  }

  await db
    .update(clubs)
    .set({ sportPack: deportes, updatedAt: new Date() })
    .where(eq(clubs.id, club.id))

  await registrarAccionSuperAdmin(
    sa.email,
    'update',
    'sport_packs',
    club.id,
    { slug: club.slug, antes: antes.map((e) => e.key), despues: Object.keys(deportes) },
    await ipDeRequest(),
  )

  revalidatePath(`/super-admin/clubs/${slug}`)
  return { ok: true, data: null }
}

// ───────────────────────── Impersonación (M14) ─────────────────────────

const impersonarSchema = z.object({
  personaId: z.string().uuid(),
  tipo: z.enum(['staff', 'socio']),
})

/**
 * Inicia la impersonación de un miembro de un club (solo SA real). Setea la
 * cookie firmada de 15 minutos; del lado del servidor, rolesEnClub /
 * esSuperAdmin pasan a resolver la identidad efectiva en la persona imitada
 * (ver src/lib/impersonacion). El SA jamás pierde su sesión real.
 */
export async function iniciarImpersonacion(slug: string, input: unknown): Promise<ActionResult<null>> {
  const parsed = impersonarSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const sa = await requireSuperAdmin()

  const [club] = await db.select().from(clubs).where(eq(clubs.slug, slug)).limit(1)
  if (!club) return { ok: false, error: 'No existe ese club' }

  // Valida que la persona pertenezca al club, tenga rol vigente coherente con
  // el tipo pedido y cuente con usuario (sin login no hay nada que imitar).
  const miembro = await withTenant(club.id, async ({ tx }) => {
    const filtroRol = parsed.data.tipo === 'staff'
      ? `pr.role IN ('presidente','secretaria','tesorero','coordinador','entrenador','manager')`
      : `pr.role NOT IN ('presidente','secretaria','tesorero','coordinador','entrenador','manager')`
    return tx.execute<{ user_id: string; name: string }>(sql`
      SELECT p.user_id, trim(p.first_name || ' ' || COALESCE(p.last_name, '')) AS name
      FROM persons p
      JOIN person_roles pr ON pr.person_id = p.id
      WHERE p.club_id = ${club.id}
        AND p.id = ${parsed.data.personaId}
        AND p.deleted_at IS NULL
        AND p.user_id IS NOT NULL
        AND (pr.valid_to IS NULL OR pr.valid_to >= current_date)
        AND (${sql.raw(filtroRol)})
      LIMIT 1
    `)
  })
  const fila = miembro.rows[0]
  if (!fila) {
    return { ok: false, error: 'Esa persona no existe en el club, no tiene rol vigente o no tiene login' }
  }

  await setearCookieImpersonacion(parsed.data.tipo, parsed.data.personaId)

  await registrarAccionSuperAdmin(
    sa.email,
    'impersonar',
    'persons',
    parsed.data.personaId,
    { club: club.slug, tipo: parsed.data.tipo, persona: fila.name },
    await ipDeRequest(),
  )

  return { ok: true, data: null }
}

/** Termina la impersonación y vuelve a la identidad real (cualquier sesión). */
export async function terminarImpersonacion(): Promise<ActionResult<null>> {
  await limpiarCookieImpersonacion()
  return { ok: true, data: null }
}