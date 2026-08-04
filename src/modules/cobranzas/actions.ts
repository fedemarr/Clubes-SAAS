'use server'

import { and, eq, isNull } from 'drizzle-orm'
import { accounts, charges, ledgerEntries, payments, persons } from '@/db/schema'
import { withTenant } from '@/db/tenant'
import { requirePermission } from '@/lib/permissions'
import { centsToDecimal, decimalToCents } from '@/lib/money'
import { emitirNotificaciones } from '@/lib/notifications/emit'
import { registrarPagoSchema, revertirPagoSchema } from './schemas'
import { estadoCargoDespuesDePago, imputarPagoFIFO } from './service'
import { buscarCuentaParaCobrar, creditosPorCargo, deudaDeCuenta } from './queries'
import type { Imputacion } from './service'

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

export type CuentaCobro = Awaited<ReturnType<typeof buscarCuentaParaCobrar>>[number]

export async function buscarCuentaCobro(clubSlug: string, input: unknown): Promise<ActionResult<CuentaCobro[]>> {
  const texto = typeof input === 'string' ? input : ''
  try {
    const ctx = await requirePermission('cobranzas.ver', { kind: 'club' }, clubSlug)
    return { ok: true, data: await buscarCuentaParaCobrar(ctx.clubId, texto) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}

export async function obtenerDeudaCobro(clubSlug: string, input: unknown): Promise<ActionResult<{ cargos: Awaited<ReturnType<typeof deudaDeCuenta>>; totalCents: number }>> {
  const accountId = typeof input === 'string' ? input : ''
  try {
    const ctx = await requirePermission('cobranzas.ver', { kind: 'club' }, clubSlug)
    const cargos = await deudaDeCuenta(ctx.clubId, accountId)
    return { ok: true, data: { cargos, totalCents: cargos.reduce((acc, c) => acc + c.saldoCents, 0) } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}

export type Recibo = {
  pagoId: string
  numero: string
  cuentaLabel: string | null
  holderNombre: string
  holderApellido: string
  montoCents: number
  metodo: string
  imputaciones: Imputacion[]
  sobranteCents: number
  pagadoFecha: Date
  cobradoPorNombre: string | null
  cobradoPorApellido: string | null
}

/**
 * Registrar un pago (efectivo del cobrador, transferencia manual o tarjeta)
 * y acreditarlo contra los cargos abiertos, FIFO por vencimiento. Todo pago
 * acreditado escribe sus créditos en el ledger (append-only) y marca los
 * cargos como pagado/parcial. El excedente queda "a cuenta".
 */
export async function registrarPago(clubSlug: string, input: unknown): Promise<ActionResult<Recibo>> {
  const parsed = registrarPagoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const ctx = await requirePermission('cobranzas.registrar', { kind: 'club' }, clubSlug)

    const recibo = await withTenant(ctx.clubId, async ({ tx }) => {
      const [cuenta] = await tx
        .select()
        .from(accounts)
        .where(and(eq(accounts.clubId, ctx.clubId), eq(accounts.id, parsed.data.accountId), isNull(accounts.deletedAt)))
        .limit(1)
      if (!cuenta) throw new Error('No existe esa cuenta.')

      const [holder] = await tx
        .select()
        .from(persons)
        .where(eq(persons.id, cuenta.holderPersonId))
        .limit(1)
      if (!holder) throw new Error('La cuenta no tiene titular.')

      const abiertos = await deudaDeCuenta(ctx.clubId, cuenta.id)
      const { imputaciones, sobranteCents } = imputarPagoFIFO(
        abiertos.map((c) => ({ id: c.id, dueOn: c.dueOn, saldoCents: c.saldoCents })),
        parsed.data.montoCents,
      )

      const [pago] = await tx
        .insert(payments)
        .values({
          clubId: ctx.clubId,
          accountId: cuenta.id,
          method: parsed.data.metodo,
          amount: centsToDecimal(parsed.data.montoCents),
          paidAt: new Date(),
          status: 'acreditado',
          recordedBy: ctx.userId,
        })
        .returning()
      if (!pago) throw new Error('No se pudo registrar el pago.')

      const pagadoAntes = await creditosPorCargo(
        tx,
        ctx.clubId,
        abiertos.map((c) => c.id),
      )

      for (const imp of imputaciones) {
        await tx.insert(ledgerEntries).values({
          clubId: ctx.clubId,
          accountId: cuenta.id,
          direction: 'credito',
          amount: centsToDecimal(imp.amountCents),
          chargeId: imp.chargeId,
          paymentId: pago.id,
          memo: `Pago ${parsed.data.metodo}`,
        })
      }
      if (sobranteCents > 0) {
        await tx.insert(ledgerEntries).values({
          clubId: ctx.clubId,
          accountId: cuenta.id,
          direction: 'credito',
          amount: centsToDecimal(sobranteCents),
          paymentId: pago.id,
          memo: `Pago ${parsed.data.metodo} · excedente a cuenta`,
        })
      }

      const porCargo = new Map(abiertos.map((c) => [c.id, c]))
      for (const imp of imputaciones) {
        const c = porCargo.get(imp.chargeId)
        if (!c) continue
        const pagado = (pagadoAntes.get(imp.chargeId) ?? 0) + imp.amountCents
        const estado = estadoCargoDespuesDePago(c.amountCents, pagado)
        if (estado !== 'pendiente') {
          await tx.update(charges).set({ status: estado }).where(eq(charges.id, imp.chargeId))
        }
      }

      const [cobrador] = await tx
        .select()
        .from(persons)
        .where(eq(persons.userId, ctx.userId))
        .limit(1)

      await emitirNotificaciones(
        tx,
        ctx.clubId,
        holder.userId
          ? [
              {
                userId: holder.userId,
                type: 'pago.acreditado',
                title: 'Pago acreditado',
                body: `Recibimos tu pago de $${centsToDecimal(parsed.data.montoCents)}. Recibo Nº ${pago.id.slice(-8).toUpperCase()}.`,
                data: { pagoId: pago.id, accountId: cuenta.id },
              },
            ]
          : [],
      )

      return {
        pagoId: pago.id,
        numero: pago.id.slice(-8).toUpperCase(),
        cuentaLabel: cuenta.label,
        holderNombre: holder.firstName,
        holderApellido: holder.lastName,
        montoCents: parsed.data.montoCents,
        metodo: parsed.data.metodo,
        imputaciones,
        sobranteCents,
        pagadoFecha: pago.paidAt,
        cobradoPorNombre: cobrador?.firstName ?? null,
        cobradoPorApellido: cobrador?.lastName ?? null,
      } satisfies Recibo
    }, { userId: ctx.userId })

    return { ok: true, data: recibo }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}

/**
 * Reversión de un pago acreditado: asiento inverso en el ledger (nunca se
 * borra el original), el pago pasa a reversado y los cargos se reabren según
 * el saldo que les queda.
 */
export async function revertirPago(clubSlug: string, input: unknown): Promise<ActionResult<null>> {
  const parsed = revertirPagoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const ctx = await requirePermission('cobranzas.registrar', { kind: 'club' }, clubSlug)

    await withTenant(ctx.clubId, async ({ tx }) => {
      const [pago] = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.clubId, ctx.clubId), eq(payments.id, parsed.data.pagoId)))
        .limit(1)
      if (!pago) throw new Error('No existe ese pago.')
      if (pago.status !== 'acreditado') throw new Error('Solo se pueden revertir pagos acreditados.')

      const creditos = await tx
        .select()
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.clubId, ctx.clubId), eq(ledgerEntries.paymentId, pago.id), eq(ledgerEntries.direction, 'credito'), isNull(ledgerEntries.reversesEntryId)))

      for (const c of creditos) {
        await tx.insert(ledgerEntries).values({
          clubId: ctx.clubId,
          accountId: pago.accountId!,
          direction: 'debito',
          amount: c.amount,
          chargeId: c.chargeId,
          paymentId: pago.id,
          reversesEntryId: c.id,
          memo: `Reversión: ${parsed.data.motivo}`,
        })
      }

      await tx.update(payments).set({ status: 'reversado' }).where(eq(payments.id, pago.id))

      const cargoIds = [...new Set(creditos.map((c) => c.chargeId).filter((id): id is string => Boolean(id)))]
      for (const id of cargoIds) {
        const [cargo] = await tx.select().from(charges).where(eq(charges.id, id)).limit(1)
        if (!cargo || cargo.status === 'anulado') continue
        const restante = await creditosPorCargo(tx, ctx.clubId, [id])
        const pagado = restante.get(id) ?? 0
        const estado = estadoCargoDespuesDePago(decimalToCents(cargo.amount), pagado)
        if (estado === 'pendiente' && cargo.status !== 'vencido') {
          await tx.update(charges).set({ status: 'pendiente' }).where(eq(charges.id, id))
        } else if (estado === 'parcial') {
          await tx.update(charges).set({ status: 'parcial' }).where(eq(charges.id, id))
        }
      }
    }, { userId: ctx.userId })

    return { ok: true, data: null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}
