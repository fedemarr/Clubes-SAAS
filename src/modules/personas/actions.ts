'use server'

import { and, eq } from 'drizzle-orm'
import { accounts, memberships, persons, personRoles, relationships } from '@/db/schema'
import { withTenant } from '@/db/tenant'
import { PermissionError, requirePermission } from '@/lib/permissions'
import { contarTutoresVigentes, puedeEstarActivo, siguienteNumeroSocio } from './service'
import { personaSchema, rolSchema, vinculoSchema } from './schemas'
import { buscarPersonas } from './queries'

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

/** Los mismos 3 tipos de vínculo son simétricos salvo tutor_de (ver plan M1: es direccional, una sola fila). */
const KIND_SIMETRICO = new Set(['conyuge_de', 'hermano_de'])

async function actor(clubSlug: string, permission: 'personas.ver' | 'personas.editar') {
  try {
    return { ctx: await requirePermission(permission, { kind: 'club' }, clubSlug), error: null as null }
  } catch (e) {
    return { ctx: null, error: e instanceof PermissionError ? e.message : 'No tenés permiso para esto.' }
  }
}

/** Picker de "otra persona" para el form de vínculos — solo lectura. */
export async function buscarPersonasParaVinculo(
  clubSlug: string,
  q: string,
): Promise<ActionResult<{ id: string; nombre: string; docNumber: string | null }[]>> {
  const { ctx, error } = await actor(clubSlug, 'personas.ver')
  if (!ctx) return { ok: false, error }
  if (q.trim().length < 2) return { ok: true, data: [] }

  const rows = await buscarPersonas(ctx.clubId, { q })
  return { ok: true, data: rows.slice(0, 10).map((r) => ({ id: r.id, nombre: `${r.firstName} ${r.lastName}`, docNumber: r.docNumber })) }
}

export async function crearPersona(
  clubSlug: string,
  input: unknown,
): Promise<ActionResult<{ id: string }> | { ok: false; error: string; existingPersonId: string }> {
  const parsed = personaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const { ctx, error } = await actor(clubSlug, 'personas.editar')
  if (!ctx) return { ok: false, error }

  return withTenant(
    ctx.clubId,
    async ({ tx }) => {
      const data = parsed.data

      if (data.docNumber) {
        const [existing] = await tx
          .select({ id: persons.id })
          .from(persons)
          .where(and(eq(persons.clubId, ctx.clubId), eq(persons.docNumber, data.docNumber)))
          .limit(1)
        if (existing) {
          return { ok: false, error: 'Ya existe una persona con ese documento', existingPersonId: existing.id }
        }
      }

      const check = puedeEstarActivo(data, 0) // persona nueva: no puede tener vínculos todavía
      if (!check.ok) return { ok: false, error: check.error }

      const memberNumber = data.status === 'activo' ? await siguienteNumeroSocio(tx, ctx.clubId) : null

      const [persona] = await tx
        .insert(persons)
        .values({
          clubId: ctx.clubId,
          firstName: data.firstName,
          lastName: data.lastName,
          docType: data.docType,
          docNumber: data.docNumber || null,
          bornOn: data.bornOn || null,
          email: data.email || null,
          phone: data.phone || null,
          photoUrl: data.photoUrl || null,
          status: data.status,
          memberNumber,
        })
        .returning()

      if (!persona) return { ok: false, error: 'No se pudo crear la persona' }
      // El trigger de auditoría (nivel 2) ya registra este INSERT con el diff
      // completo — no hace falta un audit() manual acá (ver resumen de la sesión).
      return { ok: true, data: { id: persona.id } }
    },
    { userId: ctx.userId },
  )
}

export async function actualizarPersona(clubSlug: string, id: string, input: unknown): Promise<ActionResult<null>> {
  const parsed = personaSchema.partial().safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const { ctx, error } = await actor(clubSlug, 'personas.editar')
  if (!ctx) return { ok: false, error }

  return withTenant(
    ctx.clubId,
    async ({ tx }) => {
      const [actual] = await tx
        .select()
        .from(persons)
        .where(and(eq(persons.clubId, ctx.clubId), eq(persons.id, id)))
        .limit(1)
      if (!actual) return { ok: false, error: 'No existe esa persona' }

      const data = parsed.data
      const status = data.status ?? actual.status
      if (status === 'activo') {
        const tutores = await contarTutoresVigentes(tx, ctx.clubId, id)
        const check = puedeEstarActivo({ bornOn: data.bornOn ?? actual.bornOn, status }, tutores)
        if (!check.ok) return { ok: false, error: check.error }
      }

      await tx
        .update(persons)
        .set({
          ...(data.firstName !== undefined && { firstName: data.firstName }),
          ...(data.lastName !== undefined && { lastName: data.lastName }),
          ...(data.docType !== undefined && { docType: data.docType }),
          ...(data.docNumber !== undefined && { docNumber: data.docNumber || null }),
          ...(data.bornOn !== undefined && { bornOn: data.bornOn || null }),
          ...(data.email !== undefined && { email: data.email || null }),
          ...(data.phone !== undefined && { phone: data.phone || null }),
          ...(data.photoUrl !== undefined && { photoUrl: data.photoUrl || null }),
          ...(data.status !== undefined && { status: data.status }),
          updatedAt: new Date(),
        })
        .where(eq(persons.id, id))

      // Nivel 2 (trigger) ya audita este UPDATE con el diff de columnas reales.
      return { ok: true, data: null }
    },
    { userId: ctx.userId },
  )
}

export async function eliminarPersona(clubSlug: string, id: string): Promise<ActionResult<null>> {
  const { ctx, error } = await actor(clubSlug, 'personas.editar')
  if (!ctx) return { ok: false, error }

  return withTenant(
    ctx.clubId,
    async ({ tx, audit }) => {
      await tx.update(persons).set({ deletedAt: new Date() }).where(and(eq(persons.clubId, ctx.clubId), eq(persons.id, id)))
      // deleted_at está en la lista de columnas técnicas del trigger (rls.sql,
      // sección 7): un soft delete "puro" no cambia ninguna columna de
      // negocio, así que el trigger NO generaría fila. Por eso acá sí hace
      // falta un audit() manual — es el único caso de las 5 actions de este
      // módulo donde nivel 1 no es redundante con nivel 2.
      await audit('persons', id, 'delete', { deletedAt: true })
      return { ok: true, data: null }
    },
    { userId: ctx.userId },
  )
}

export async function agregarRol(clubSlug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = rolSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const { ctx, error } = await actor(clubSlug, 'personas.editar')
  if (!ctx) return { ok: false, error }

  return withTenant(
    ctx.clubId,
    async ({ tx }) => {
      const [rol] = await tx
        .insert(personRoles)
        .values({
          clubId: ctx.clubId,
          personId: parsed.data.personId,
          role: parsed.data.role,
          scopeTeamId: parsed.data.scopeTeamId,
          validFrom: parsed.data.validFrom,
          validTo: parsed.data.validTo,
        })
        .returning()
      if (!rol) return { ok: false, error: 'No se pudo agregar el rol' }
      return { ok: true, data: { id: rol.id } }
    },
    { userId: ctx.userId },
  )
}

export async function finalizarRol(clubSlug: string, roleId: string, validTo: string): Promise<ActionResult<null>> {
  const { ctx, error } = await actor(clubSlug, 'personas.editar')
  if (!ctx) return { ok: false, error }

  return withTenant(
    ctx.clubId,
    async ({ tx }) => {
      await tx.update(personRoles).set({ validTo }).where(and(eq(personRoles.clubId, ctx.clubId), eq(personRoles.id, roleId)))
      return { ok: true, data: null }
    },
    { userId: ctx.userId },
  )
}

export async function crearVinculo(
  clubSlug: string,
  input: unknown,
): Promise<ActionResult<{ ofrecerUnificarCuenta: false } | { ofrecerUnificarCuenta: true; cuentaTutorId: string | null; cuentaTutorLabel: string | null }>> {
  const parsed = vinculoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  if (parsed.data.personId === parsed.data.relatedPersonId) {
    return { ok: false, error: 'Una persona no puede tener un vínculo consigo misma' }
  }

  const { ctx, error } = await actor(clubSlug, 'personas.editar')
  if (!ctx) return { ok: false, error }

  return withTenant(
    ctx.clubId,
    async ({ tx }) => {
      const { personId, relatedPersonId, kind } = parsed.data

      const [yaExiste] = await tx
        .select({ id: relationships.id })
        .from(relationships)
        .where(and(eq(relationships.clubId, ctx.clubId), eq(relationships.personId, personId), eq(relationships.relatedPersonId, relatedPersonId), eq(relationships.kind, kind)))
        .limit(1)
      if (yaExiste) return { ok: false, error: 'Ese vínculo ya existe' }

      await tx.insert(relationships).values({ clubId: ctx.clubId, personId, relatedPersonId, kind })

      if (KIND_SIMETRICO.has(kind)) {
        const [yaExisteEspejo] = await tx
          .select({ id: relationships.id })
          .from(relationships)
          .where(and(eq(relationships.clubId, ctx.clubId), eq(relationships.personId, relatedPersonId), eq(relationships.relatedPersonId, personId), eq(relationships.kind, kind)))
          .limit(1)
        if (!yaExisteEspejo) {
          await tx.insert(relationships).values({ clubId: ctx.clubId, personId: relatedPersonId, relatedPersonId: personId, kind })
        }
      }

      if (kind !== 'tutor_de') {
        return { ok: true, data: { ofrecerUnificarCuenta: false } }
      }

      const [cuentaTutor] = await tx
        .select({ id: accounts.id, label: accounts.label })
        .from(accounts)
        .where(and(eq(accounts.clubId, ctx.clubId), eq(accounts.holderPersonId, personId)))
        .limit(1)

      return {
        ok: true,
        data: { ofrecerUnificarCuenta: true, cuentaTutorId: cuentaTutor?.id ?? null, cuentaTutorLabel: cuentaTutor?.label ?? null },
      }
    },
    { userId: ctx.userId },
  )
}

export async function unificarCuentaCorriente(
  clubSlug: string,
  childPersonId: string,
  accountId: string,
): Promise<ActionResult<{ actualizadas: number }>> {
  const { ctx, error } = await actor(clubSlug, 'personas.editar')
  if (!ctx) return { ok: false, error }

  return withTenant(
    ctx.clubId,
    async ({ tx, audit }) => {
      const [cuenta] = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.clubId, ctx.clubId), eq(accounts.id, accountId)))
        .limit(1)
      if (!cuenta) return { ok: false, error: 'La cuenta no existe' }

      const activas = await tx
        .update(memberships)
        .set({ accountId })
        .where(and(eq(memberships.clubId, ctx.clubId), eq(memberships.personId, childPersonId)))
        .returning({ id: memberships.id })

      // Evento semántico que abarca varias filas de `memberships`: acá sí
      // vale la pena un audit() de nivel 1 además de lo que ya registró el
      // trigger por cada membership tocada.
      await audit('accounts', accountId, 'custom', { unificoCuentaDe: childPersonId, membershipsActualizadas: activas.length })

      return { ok: true, data: { actualizadas: activas.length } }
    },
    { userId: ctx.userId },
  )
}
