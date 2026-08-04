/**
 * Núcleo de acreditación de pagos al ledger (compartido entre la action
 * de cobranzas, el webhook de Mercado Pago y la conciliación). Recibe la
 * transacción ya abierta con withTenant y hace todo el trabajo de escritura:
 * pago + créditos FIFO + estados de cargos. Idempotente por externalRef.
 */
import { and, eq, isNull } from 'drizzle-orm'
import type { Tx } from '@/db/tenant'
import { accounts, charges, ledgerEntries, payments, persons } from '@/db/schema'
import { centsToDecimal, decimalToCents } from '@/lib/money'
import { estadoCargoDespuesDePago, imputarPagoFIFO } from './service'
import type { MetodoPago } from './service'
import { creditosPorCargo, deudaDeCuentaEnTx } from './queries'

export type AcreditarPagoInput = {
  accountId: string
  montoCents: number
  metodo: MetodoPago
  paidAt?: Date
  externalRef?: string | null
  rawPayload?: Record<string, unknown> | null
  recordedBy?: string | null
}

export type AcreditacionResultado = {
  pagoId: string
  yaExistia: boolean
  imputaciones: { chargeId: string; amountCents: number }[]
  sobranteCents: number
  holderUserId: string | null
}

/**
 * Registra un pago acreditado: créditos en el ledger (append-only) imputados
 * FIFO por vencimiento, estado de cargos actualizado y excedente a cuenta.
 * Si externalRef ya existe para el club, no escribe nada (idempotencia: un
 * webhook duplicado no genera un segundo pago).
 */
export async function acreditarPagoEnLedger(
  tx: Tx,
  clubId: string,
  input: AcreditarPagoInput,
): Promise<AcreditacionResultado> {
  if (input.externalRef) {
    const [existente] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.clubId, clubId), eq(payments.externalRef, input.externalRef)))
      .limit(1)
    if (existente) {
      return { pagoId: existente.id, yaExistia: true, imputaciones: [], sobranteCents: 0, holderUserId: null }
    }
  }

  const [cuenta] = await tx
    .select()
    .from(accounts)
    .where(and(eq(accounts.clubId, clubId), eq(accounts.id, input.accountId), isNull(accounts.deletedAt)))
    .limit(1)
  if (!cuenta) throw new Error('No existe esa cuenta.')

  const [holder] = await tx
    .select({ userId: persons.userId })
    .from(persons)
    .where(eq(persons.id, cuenta.holderPersonId))
    .limit(1)
  if (!holder) throw new Error('La cuenta no tiene titular.')

  const abiertos = await deudaDeCuentaEnTx(tx, clubId, input.accountId)
  const { imputaciones, sobranteCents } = imputarPagoFIFO(
    abiertos.map((c) => ({ id: c.id, dueOn: c.dueOn, saldoCents: c.saldoCents })),
    input.montoCents,
  )

  const [pago] = await tx
    .insert(payments)
    .values({
      clubId,
      accountId: cuenta.id,
      method: input.metodo,
      amount: centsToDecimal(input.montoCents),
      paidAt: input.paidAt ?? new Date(),
      status: 'acreditado',
      externalRef: input.externalRef ?? null,
      rawPayload: input.rawPayload ?? null,
      recordedBy: input.recordedBy ?? null,
    })
    .returning()
  if (!pago) throw new Error('No se pudo registrar el pago.')

  const pagadoAntes = await creditosPorCargo(
    tx,
    clubId,
    abiertos.map((c) => c.id),
  )

  for (const imp of imputaciones) {
    await tx.insert(ledgerEntries).values({
      clubId,
      accountId: cuenta.id,
      direction: 'credito',
      amount: centsToDecimal(imp.amountCents),
      chargeId: imp.chargeId,
      paymentId: pago.id,
      memo: `Pago ${input.metodo}`,
    })
  }
  if (sobranteCents > 0) {
    await tx.insert(ledgerEntries).values({
      clubId,
      accountId: cuenta.id,
      direction: 'credito',
      amount: centsToDecimal(sobranteCents),
      paymentId: pago.id,
      memo: `Pago ${input.metodo} · excedente a cuenta`,
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

  return { pagoId: pago.id, yaExistia: false, imputaciones, sobranteCents, holderUserId: holder.userId }
}

export type AcreditacionPendienteResultado = {
  pagoId: string
  imputaciones: { chargeId: string; amountCents: number }[]
  sobranteCents: number
  holderUserId: string | null
}

/**
 * Acredita un pago que entró como pendiente sin cuenta (transferencia no
 * identificada, conciliación). Le asigna la cuenta, lo marca acreditado y
 * escribe los créditos FIFO contra los cargos abiertos.
 */
export async function acreditarPagoPendiente(
  tx: Tx,
  clubId: string,
  pagoId: string,
  accountId: string,
): Promise<AcreditacionPendienteResultado> {
  const [pago] = await tx
    .select()
    .from(payments)
    .where(and(eq(payments.clubId, clubId), eq(payments.id, pagoId)))
    .limit(1)
  if (!pago) throw new Error('No existe ese pago.')
  if (pago.status === 'reversado') throw new Error('Ese pago fue reversado.')
  if (pago.status === 'acreditado' && pago.accountId) {
    return { pagoId: pago.id, imputaciones: [], sobranteCents: 0, holderUserId: null }
  }

  const [cuenta] = await tx
    .select()
    .from(accounts)
    .where(and(eq(accounts.clubId, clubId), eq(accounts.id, accountId), isNull(accounts.deletedAt)))
    .limit(1)
  if (!cuenta) throw new Error('No existe esa cuenta.')

  const [holder] = await tx
    .select({ userId: persons.userId })
    .from(persons)
    .where(eq(persons.id, cuenta.holderPersonId))
    .limit(1)
  if (!holder) throw new Error('La cuenta no tiene titular.')

  const abiertos = await deudaDeCuentaEnTx(tx, clubId, accountId)
  const montoCents = decimalToCents(pago.amount)
  const { imputaciones, sobranteCents } = imputarPagoFIFO(
    abiertos.map((c) => ({ id: c.id, dueOn: c.dueOn, saldoCents: c.saldoCents })),
    montoCents,
  )

  await tx.update(payments).set({ accountId, status: 'acreditado', reconciledAt: new Date() }).where(eq(payments.id, pago.id))

  const pagadoAntes = await creditosPorCargo(
    tx,
    clubId,
    abiertos.map((c) => c.id),
  )

  for (const imp of imputaciones) {
    await tx.insert(ledgerEntries).values({
      clubId,
      accountId,
      direction: 'credito',
      amount: centsToDecimal(imp.amountCents),
      chargeId: imp.chargeId,
      paymentId: pago.id,
      memo: `Pago ${pago.method}`,
    })
  }
  if (sobranteCents > 0) {
    await tx.insert(ledgerEntries).values({
      clubId,
      accountId,
      direction: 'credito',
      amount: centsToDecimal(sobranteCents),
      paymentId: pago.id,
      memo: `Pago ${pago.method} · excedente a cuenta`,
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

  return { pagoId: pago.id, imputaciones, sobranteCents, holderUserId: holder.userId }
}
