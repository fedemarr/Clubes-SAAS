import { createHmac, timingSafeEqual } from 'crypto'
import { fetchPagoMP, procesarPagoMP } from '@/modules/cobranzas/mercadopago'
import type { PagoMP } from '@/modules/cobranzas/mercadopago'

export const runtime = 'nodejs'

type WebhookBody = {
  type?: string
  action?: string
  data?: { id?: string | number }
  id?: string | number
  status?: string
  transaction_amount?: string | number
  external_reference?: string | null
  date_approved?: string | null
}

function verificarFirma(secret: string, req: Request, body: unknown): boolean {
  const firma = req.headers.get('x-signature')
  const requestId = req.headers.get('x-request-id')
  if (!firma || !requestId) return false
  const [tsRaw, v1Raw] = firma.split(',').map((p) => p.trim())
  const ts = tsRaw?.replace(/^ts=/, '')
  const v1 = v1Raw?.replace(/^v1=/, '')
  if (!ts || !v1) return false

  const dataId = (body as WebhookBody)?.data?.id ?? (body as WebhookBody)?.id
  const mensaje = `id:${dataId};request-id:${requestId};ts:${ts};`
  const esperado = createHmac('sha256', secret).update(mensaje).digest('hex')
  const a = Buffer.from(esperado, 'utf8')
  const b = Buffer.from(v1, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Webhook de Mercado Pago (M4.2). Idempotente: si el pago ya se acreditó
 * (mismo externalRef = id del pago de MP), no escribe nada y responde 200.
 * Con MERCADOPAGO_WEBHOOK_SECRET configurado exige la firma de MP; en dev
 * (sin token de API) acepta el payload directo para probar contra la base.
 */
export async function POST(req: Request) {
  let body: WebhookBody
  try {
    body = (await req.json()) as WebhookBody
  } catch {
    return Response.json({ error: 'cuerpo inválido' }, { status: 400 })
  }

  // MP notifica de muchos tipos; solo nos interesa payment.*
  const tipo = body.type ?? body.action ?? ''
  if (!String(tipo).startsWith('payment')) {
    return Response.json({ received: true, ignorado: true })
  }

  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET
  if (secret && !verificarFirma(secret, req, body)) {
    return Response.json({ error: 'firma inválida' }, { status: 401 })
  }

  const mpPaymentId = body.data?.id ?? body.id
  if (!mpPaymentId) {
    return Response.json({ error: 'sin id de pago' }, { status: 400 })
  }

  let pago: PagoMP | null = null
  const tieneToken = Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN)

  if (tieneToken) {
    pago = await fetchPagoMP(String(mpPaymentId))
    if (!pago) {
      return Response.json({ error: 'no se pudo traer el pago de MP' }, { status: 502 })
    }
  } else {
    // Modo dev: sin token de API no hay forma de fetch real, se usa el payload.
    if (!body.status) {
      return Response.json({ received: true, ignorado: true })
    }
    pago = {
      id: String(mpPaymentId),
      status: body.status,
      transaction_amount: body.transaction_amount ?? 0,
      external_reference: body.external_reference ?? null,
      date_approved: body.date_approved ?? null,
    }
  }

  const resultado = await procesarPagoMP(pago)
  if (!resultado.ok) {
    // Respondemos 200 igual: MP reintenta solo si no responde 2xx, pero un
    // error de datos no se arregla reintentando. El pago queda sin conciliar.
    console.warn('[mp:webhook]', resultado.error)
    return Response.json({ received: true, error: resultado.error })
  }

  return Response.json({ received: true, yaProcesado: resultado.yaProcesado })
}
