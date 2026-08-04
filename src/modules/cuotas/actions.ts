'use server'

import { and, eq } from 'drizzle-orm'
import { accounts, charges, feePlans, ledgerEntries, memberships, persons } from '@/db/schema'
import { withTenant } from '@/db/tenant'
import { requirePermission } from '@/lib/permissions'
import { centsToDecimal } from '@/lib/money'
import { planSchema, ajustePrecioSchema, membresiaSchema, terminarMembresiaSchema, periodoSchema, anularCargoSchema, ajusteCuentaSchema } from './schemas'
import { validarNuevaVersion, generarCargosDelMes } from './service'
import { membresiasParaPeriodo, obtenerConfigFinanzas, planesParaCargo } from './queries'

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

// ---------------------------------------------------------------------------
// M3.2 · Generación mensual de cargos
// ---------------------------------------------------------------------------

export type CargoPreview = {
  membershipId: string
  personId: string
  personaNombre: string
  personaApellido: string
  cuentaLabel: string | null
  planName: string
  sport: string | null
  concept: string
  amountCents: number
  descuentoPct: number
  dueOn: string
}

export type PreviewPorCuenta = {
  accountId: string
  cuentaLabel: string | null
  personaNombre: string
  personaApellido: string
  cargos: CargoPreview[]
  totalCents: number
}

export type Previsualizacion = {
  periodo: string
  config: { prorrateoParcial: string; vencimientoDia: number }
  cuentas: PreviewPorCuenta[]
  omitidos: number
  totalCents: number
  cantidad: number
}

export async function previsualizarCargos(clubSlug: string, input: unknown): Promise<ActionResult<Previsualizacion>> {
  const parsed = periodoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Período inválido' }

  try {
    const ctx = await requirePermission('cuotas.emitir', { kind: 'club' }, clubSlug)
    const [config, membresias, planes] = await Promise.all([
      obtenerConfigFinanzas(ctx.clubId),
      membresiasParaPeriodo(ctx.clubId, parsed.data.periodo),
      planesParaCargo(ctx.clubId),
    ])

    const resultado = generarCargosDelMes(parsed.data.periodo, config, membresias, planes)

    const porCuenta = Map.groupBy(resultado.cargos, (c) => c.accountId)
    const cuentas: PreviewPorCuenta[] = []
    for (const [accountId, cargos] of porCuenta) {
      const primera = cargos[0]!
      const deMembresia = membresias.find((m) => m.id === primera.membershipId)
      cuentas.push({
        accountId,
        cuentaLabel: deMembresia?.cuentaLabel ?? null,
        personaNombre: deMembresia?.personaNombre ?? '',
        personaApellido: deMembresia?.personaApellido ?? '',
        cargos: cargos.map((c) => ({
          ...c,
          personaNombre: deMembresia?.personaNombre ?? '',
          personaApellido: deMembresia?.personaApellido ?? '',
          cuentaLabel: deMembresia?.cuentaLabel ?? null,
        })),
        totalCents: cargos.reduce((acc, c) => acc + c.amountCents, 0),
      })
    }

    return {
      ok: true,
      data: {
        periodo: parsed.data.periodo,
        config: { prorrateoParcial: config.prorrateoParcial, vencimientoDia: config.vencimientoDia },
        cuentas,
        omitidos: resultado.omitidos.length,
        totalCents: resultado.cargos.reduce((acc, c) => acc + c.amountCents, 0),
        cantidad: resultado.cargos.length,
      },
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}

export async function confirmarCargos(
  clubSlug: string,
  input: unknown,
): Promise<ActionResult<{ insertados: number; existentes: number }>> {
  const parsed = periodoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Período inválido' }

  try {
    const ctx = await requirePermission('cuotas.emitir', { kind: 'club' }, clubSlug)
    const [config, membresias, planes] = await Promise.all([
      obtenerConfigFinanzas(ctx.clubId),
      membresiasParaPeriodo(ctx.clubId, parsed.data.periodo),
      planesParaCargo(ctx.clubId),
    ])

    const resultado = generarCargosDelMes(parsed.data.periodo, config, membresias, planes)

    const { insertados, existentes } = await withTenant(ctx.clubId, async ({ tx }) => {
      let insertados = 0
      let existentes = 0
      for (const c of resultado.cargos) {
        const [inserted] = await tx
          .insert(charges)
          .values({
            clubId: ctx.clubId,
            accountId: c.accountId,
            membershipId: c.membershipId,
            period: parsed.data.periodo,
            concept: c.concept,
            amount: centsToDecimal(c.amountCents),
            dueOn: c.dueOn,
            status: 'pendiente',
          })
          .onConflictDoNothing({ target: [charges.membershipId, charges.period, charges.concept] })
          .returning()

        if (!inserted) {
          existentes += 1
          continue
        }

        // Todo cargo escribe su débito en el ledger (append-only).
        await tx.insert(ledgerEntries).values({
          clubId: ctx.clubId,
          accountId: c.accountId,
          direction: 'debito',
          amount: centsToDecimal(c.amountCents),
          chargeId: inserted.id,
          memo: c.concept,
        })
        insertados += 1
      }
      return { insertados, existentes }
    }, { userId: ctx.userId })

    return { ok: true, data: { insertados, existentes } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}

// ---------------------------------------------------------------------------
// M3.3 · Cuenta corriente familiar
// ---------------------------------------------------------------------------

/**
 * Un cargo emitido no se edita (regla del brief): se anula con nota de
 * crédito. El ledger es append-only, así que la anulación es un asiento
 * de crédito que apunta al débito original vía reversesEntryId, y el cargo
 * pasa a status anulado. Nada se borra.
 */
export async function anularCargo(clubSlug: string, input: unknown): Promise<ActionResult<{ cargoId: string }>> {
  const parsed = anularCargoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const ctx = await requirePermission('cuotas.emitir', { kind: 'club' }, clubSlug)

    const cargoId = await withTenant(ctx.clubId, async ({ tx }) => {
      const [cargo] = await tx
        .select()
        .from(charges)
        .where(and(eq(charges.clubId, ctx.clubId), eq(charges.id, parsed.data.cargoId)))
        .limit(1)
      if (!cargo) throw new Error('No existe ese cargo.')
      if (cargo.status === 'anulado') throw new Error('Ese cargo ya está anulado.')
      if (cargo.status === 'pagado' || cargo.status === 'parcial') {
        throw new Error('Ese cargo ya tiene pagos. Revertí el pago antes de anularlo.')
      }

      const [original] = await tx
        .select()
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.chargeId, cargo.id), eq(ledgerEntries.direction, 'debito')))
        .limit(1)
      if (!original) throw new Error('El cargo no tiene su débito en el ledger.')

      await tx.insert(ledgerEntries).values({
        clubId: ctx.clubId,
        accountId: cargo.accountId,
        direction: 'credito',
        amount: cargo.amount,
        reversesEntryId: original.id,
        memo: `Anulación: ${parsed.data.motivo}`,
      })
      await tx.update(charges).set({ status: 'anulado' }).where(eq(charges.id, cargo.id))
      return cargo.id
    }, { userId: ctx.userId })

    return { ok: true, data: { cargoId } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}

/** Ajuste manual de la cuenta corriente, siempre con motivo obligatorio. */
export async function ajustarCuenta(clubSlug: string, input: unknown): Promise<ActionResult<null>> {
  const parsed = ajusteCuentaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const ctx = await requirePermission('cuotas.emitir', { kind: 'club' }, clubSlug)

    await withTenant(ctx.clubId, async ({ tx }) => {
      const [cuenta] = await tx
        .select()
        .from(accounts)
        .where(and(eq(accounts.clubId, ctx.clubId), eq(accounts.id, parsed.data.accountId)))
        .limit(1)
      if (!cuenta) throw new Error('No existe esa cuenta.')

      await tx.insert(ledgerEntries).values({
        clubId: ctx.clubId,
        accountId: cuenta.id,
        direction: parsed.data.direccion,
        amount: centsToDecimal(parsed.data.montoCents),
        memo: `Ajuste: ${parsed.data.motivo}`,
      })
    }, { userId: ctx.userId })

    return { ok: true, data: null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}
