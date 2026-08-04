'use server'

import { and, eq } from 'drizzle-orm'
import { accounts, feePlans, memberships, persons } from '@/db/schema'
import { withTenant } from '@/db/tenant'
import { requirePermission } from '@/lib/permissions'
import { centsToDecimal } from '@/lib/money'
import { planSchema, ajustePrecioSchema, membresiaSchema, terminarMembresiaSchema } from './schemas'
import { validarNuevaVersion } from './service'

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

export async function crearPlan(clubSlug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = planSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const ctx = await requirePermission('cuotas.emitir', { kind: 'club' }, clubSlug)
    const id = await withTenant(ctx.clubId, async ({ tx }) => {
      const [plan] = await tx
        .insert(feePlans)
        .values({
          clubId: ctx.clubId,
          name: parsed.data.name,
          sport: parsed.data.sport || null,
          amount: centsToDecimal(parsed.data.amountCents),
          siblingDiscounts: parsed.data.siblingDiscounts ?? null,
          validFrom: parsed.data.validFrom,
        })
        .returning()
      return plan!.id
    }, { userId: ctx.userId })
    return { ok: true, data: { id } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}

export async function ajustarPrecio(clubSlug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = ajustePrecioSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const ctx = await requirePermission('cuotas.emitir', { kind: 'club' }, clubSlug)

    const id = await withTenant(ctx.clubId, async ({ tx }) => {
      const existentes = await tx
        .select()
        .from(feePlans)
        .where(and(eq(feePlans.clubId, ctx.clubId), eq(feePlans.sport, parsed.data.sport)))

      const conflicto = validarNuevaVersion(existentes, parsed.data.validFrom)
      if (conflicto) throw new Error(conflicto)

      const fin = new Date(parsed.data.validFrom + 'T12:00:00Z')
      fin.setUTCDate(fin.getUTCDate() - 1)
      const finISO = fin.toISOString().slice(0, 10)

      const activos = existentes.filter((p) => !p.validTo)
      for (const p of activos) {
        await tx.update(feePlans).set({ validTo: finISO }).where(eq(feePlans.id, p.id))
      }

      const [plan] = await tx
        .insert(feePlans)
        .values({
          clubId: ctx.clubId,
          name: parsed.data.nombre,
          sport: parsed.data.sport,
          amount: centsToDecimal(parsed.data.amountCents),
          siblingDiscounts: parsed.data.siblingDiscounts ?? null,
          validFrom: parsed.data.validFrom,
        })
        .returning()
      return plan!.id
    }, { userId: ctx.userId })

    return { ok: true, data: { id } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}

export async function crearMembresia(clubSlug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = membresiaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const ctx = await requirePermission('cuotas.emitir', { kind: 'club' }, clubSlug)

    const id = await withTenant(ctx.clubId, async ({ tx }) => {
      const [persona] = await tx
        .select()
        .from(persons)
        .where(and(eq(persons.clubId, ctx.clubId), eq(persons.id, parsed.data.personId)))
        .limit(1)
      const [cuenta] = await tx
        .select()
        .from(accounts)
        .where(and(eq(accounts.clubId, ctx.clubId), eq(accounts.id, parsed.data.accountId)))
        .limit(1)
      const [plan] = await tx
        .select()
        .from(feePlans)
        .where(and(eq(feePlans.clubId, ctx.clubId), eq(feePlans.id, parsed.data.feePlanId)))
        .limit(1)
      if (!persona || !cuenta || !plan) throw new Error('Persona, cuenta o plan inválidos para este club.')

      const [m] = await tx
        .insert(memberships)
        .values({
          clubId: ctx.clubId,
          personId: persona.id,
          accountId: cuenta.id,
          feePlanId: plan.id,
          status: parsed.data.status,
          startedOn: parsed.data.startedOn,
        })
        .returning()
      return m!.id
    }, { userId: ctx.userId })

    return { ok: true, data: { id } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}

export async function terminarMembresia(clubSlug: string, input: unknown): Promise<ActionResult<null>> {
  const parsed = terminarMembresiaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const ctx = await requirePermission('cuotas.emitir', { kind: 'club' }, clubSlug)

    await withTenant(ctx.clubId, async ({ tx }) => {
      const [m] = await tx
        .select()
        .from(memberships)
        .where(and(eq(memberships.clubId, ctx.clubId), eq(memberships.id, parsed.data.membershipId)))
        .limit(1)
      if (!m) throw new Error('No existe esa membresía.')

      await tx
        .update(memberships)
        .set({ status: 'baja', endedOn: parsed.data.endedOn })
        .where(eq(memberships.id, m.id))
    }, { userId: ctx.userId })

    return { ok: true, data: null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}
