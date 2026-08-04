/**
 * Mercado Pago (M4.2): link de pago por cuenta y procesamiento de webhooks.
 * external_reference = `${clubId}:${accountId}:${periodo}` — el webhook
 * llega sin sesión ni contexto de club, así que la referencia lleva el
 * clubId para poder arrancar withTenant. La acreditación reusa el núcleo
 * compartido y es idempotente por externalRef (el id del pago de MP): un
 * webhook duplicado no genera un segundo pago.
 */
import { and, eq, isNull } from 'drizzle-orm'
import { withTenant } from '@/db/tenant'
import { ledgerEntries, payments } from '@/db/schema'
import { decimalToCents } from '@/lib/money'
import { acreditarPagoEnLedger } from './acreditacion'

export type PagoMP = {
  id: string
  status: string
  transaction_amount: string | number
  external_reference: string | null
  date_approved: string | null
}

const ACCESS_TOKEN = () => process.env.MERCADOPAGO_ACCESS_TOKEN

export type ResultadoLinkPago =
  | { modo: 'mp'; url: string; externalRef: string }
  | { modo: 'dev'; url: string; externalRef: string; aviso: string }

/**
 * Crea la preferencia de Checkout Pro para una cuenta. En dev (sin token)
 * devuelve un link ficticio con la external_reference para poder probar el
 * flujo del webhook contra la base real.
 */
export async function crearPreferenciaPago(
  clubId: string,
  accountId: string,
  montoCents: number,
  periodo: string,
): Promise<ResultadoLinkPago> {
  const externalRef = `${clubId}:${accountId}:${periodo}`
  const token = ACCESS_TOKEN()

  if (!token) {
    return {
      modo: 'dev',
      url: `https://mercadopago.dev/checkout?external_reference=${encodeURIComponent(externalRef)}`,
      externalRef,
      aviso: 'Mercado Pago no está configurado (falta MERCADOPAGO_ACCESS_TOKEN). Este es un link de desarrollo.',
    }
  }

  const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [
        {
          title: `Cuota de club ${periodo}`,
          quantity: 1,
          currency_id: 'ARS',
          unit_price: montoCents / 100,
        },
      ],
      external_reference: externalRef,
      auto_return: 'approved',
      back_urls: { success: '/', failure: '/', pending: '/' },
    }),
  })
  if (!res.ok) {
    throw new Error(`Mercado Pago rechazó la preferencia (${res.status})`)
  }
  const data = (await res.json()) as { init_point?: string; id: string }
  if (!data.init_point) throw new Error('Mercado Pago no devolvió init_point')
  return { modo: 'mp', url: data.init_point, externalRef }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `${clubId}:${accountId}:${periodo}` → { clubId, accountId } o null. */
export function parsearExternalRef(externalRef: string | null): { clubId: string; accountId: string } | null {
  if (!externalRef) return null
  const [clubId, accountId] = externalRef.split(':')
  if (!UUID.test(clubId ?? '') || !UUID.test(accountId ?? '')) return null
  return { clubId, accountId }
}

/** Trae el pago desde la API de MP. Null si no hay token o falla. */
export async function fetchPagoMP(mpPaymentId: string): Promise<PagoMP | null> {
  const token = ACCESS_TOKEN()
  if (!token) return null
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${mpPaymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (!res.ok) return null
  const data = (await res.json()) as PagoMP
  return {
    id: String(data.id),
    status: data.status,
    transaction_amount: data.transaction_amount,
    external_reference: data.external_reference,
    date_approved: data.date_approved,
  }
}

export type ResultadoProcesamientoMP =
  | { ok: true; yaProcesado: boolean; pagoId: string | null }
  | { ok: false; error: string }

/**
 * Procesa el webhook de un pago de MP. Solo status 'approved' acredita.
 * 'refunded'/'cancelled' sobre un pago ya acreditado lo revierte. Cualquier
 * otra cosa se ignora (no se acredita un pago pendiente).
 */
export async function procesarPagoMP(pago: PagoMP): Promise<ResultadoProcesamientoMP> {
  const ref = parsearExternalRef(pago.external_reference)
  if (!ref) return { ok: false, error: 'external_reference inválida' }

  const externalRef = String(pago.id)

  if (pago.status === 'approved') {
    const montoCents = decimalToCents(pago.transaction_amount)
    const resultado = await withTenant(ref.clubId, async ({ tx }) => {
      return acreditarPagoEnLedger(tx, ref.clubId, {
        accountId: ref.accountId,
        montoCents,
        metodo: 'mercado_pago',
        paidAt: pago.date_approved ? new Date(pago.date_approved) : undefined,
        externalRef,
        rawPayload: pago as unknown as Record<string, unknown>,
      })
    })
    return { ok: true, yaProcesado: resultado.yaExistia, pagoId: resultado.pagoId }
  }

  if ((pago.status === 'refunded' || pago.status === 'cancelled') && pago.date_approved) {
    // El pago se aprobó y después se revirtió: hay que desacreditarlo.
    const pagoId = await withTenant(ref.clubId, async ({ tx }) => {
      const [existente] = await tx
        .select({ id: payments.id, status: payments.status })
        .from(payments)
        .where(and(eq(payments.clubId, ref.clubId), eq(payments.externalRef, externalRef)))
        .limit(1)
      if (!existente || existente.status !== 'acreditado') return null
      const creditos = await tx
        .select()
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.clubId, ref.clubId),
            eq(ledgerEntries.paymentId, existente.id),
            eq(ledgerEntries.direction, 'credito'),
            isNull(ledgerEntries.reversesEntryId),
          ),
        )
      for (const c of creditos) {
        await tx.insert(ledgerEntries).values({
          clubId: ref.clubId,
          accountId: c.accountId,
          direction: 'debito',
          amount: c.amount,
          chargeId: c.chargeId,
          paymentId: existente.id,
          reversesEntryId: c.id,
          memo: 'Reversión: devolución Mercado Pago',
        })
      }
      await tx.update(payments).set({ status: 'reversado' }).where(eq(payments.id, existente.id))
      return existente.id
    })
    return { ok: true, yaProcesado: false, pagoId }
  }

  return { ok: true, yaProcesado: false, pagoId: null }
}
