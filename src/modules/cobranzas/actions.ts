'use server'

import { createHash } from 'crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { accounts, charges, ledgerEntries, payments, persons } from '@/db/schema'
import { withTenant } from '@/db/tenant'
import { requirePermission } from '@/lib/permissions'
import { centsToDecimal, decimalToCents, formatARS } from '@/lib/money'
import { emitirNotificaciones } from '@/lib/notifications/emit'
import { registrarPagoSchema, revertirPagoSchema, generarLinkPagoSchema, importarExtractoSchema } from './schemas'
import { estadoCargoDespuesDePago, parsearExtractoCSV, proponerMatcheos } from './service'
import type { MovimientoExtracto, PropuestaMatch } from './service'
import { acreditarPagoEnLedger, acreditarPagoPendiente } from './acreditacion'
import { crearPreferenciaPago } from './mercadopago'
import { buscarCuentaParaCobrar, creditosPorCargo, deudaDeCuenta } from './queries'
import type { ResultadoLinkPago } from './mercadopago'

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
  imputaciones: { chargeId: string; amountCents: number }[]
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
      const resultado = await acreditarPagoEnLedger(tx, ctx.clubId, {
        accountId: parsed.data.accountId,
        montoCents: parsed.data.montoCents,
        metodo: parsed.data.metodo,
        recordedBy: ctx.userId,
      })

      const [cuenta] = await tx
        .select()
        .from(accounts)
        .where(and(eq(accounts.clubId, ctx.clubId), eq(accounts.id, parsed.data.accountId)))
        .limit(1)
      const [holder] = await tx
        .select()
        .from(persons)
        .where(eq(persons.id, cuenta!.holderPersonId))
        .limit(1)
      const [cobrador] = await tx
        .select()
        .from(persons)
        .where(eq(persons.userId, ctx.userId))
        .limit(1)

      await emitirNotificaciones(
        tx,
        ctx.clubId,
        resultado.holderUserId
          ? [
              {
                userId: resultado.holderUserId,
                type: 'pago.acreditado',
                title: 'Pago acreditado',
                body: `Recibimos tu pago de ${formatARS(parsed.data.montoCents)}. Recibo Nº ${resultado.pagoId.slice(-8).toUpperCase()}.`,
                data: { pagoId: resultado.pagoId, accountId: parsed.data.accountId },
              },
            ]
          : [],
      )

      return {
        pagoId: resultado.pagoId,
        numero: resultado.pagoId.slice(-8).toUpperCase(),
        cuentaLabel: cuenta?.label ?? null,
        holderNombre: holder?.firstName ?? '',
        holderApellido: holder?.lastName ?? '',
        montoCents: parsed.data.montoCents,
        metodo: parsed.data.metodo,
        imputaciones: resultado.imputaciones,
        sobranteCents: resultado.sobranteCents,
        pagadoFecha: new Date(),
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

export type LinkDePago = ResultadoLinkPago & { montoCents: number; periodo: string }

/**
 * Genera el link de pago de Mercado Pago para una cuenta (external_reference
 * = clubId:accountId:periodo). El monto es la deuda total actual. En dev
 * devuelve un link ficticio que permite probar el webhook.
 */
export async function generarLinkPago(clubSlug: string, input: unknown): Promise<ActionResult<LinkDePago>> {
  const parsed = generarLinkPagoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const ctx = await requirePermission('cobranzas.registrar', { kind: 'club' }, clubSlug)
    const periodo = parsed.data.periodo ?? new Date().toISOString().slice(0, 7)

    const cargos = await deudaDeCuenta(ctx.clubId, parsed.data.accountId)
    const montoCents = cargos.reduce((acc, c) => acc + c.saldoCents, 0)
    if (montoCents <= 0) return { ok: false, error: 'La cuenta no tiene deuda pendiente.' }

    const link = await crearPreferenciaPago(ctx.clubId, parsed.data.accountId, montoCents, periodo)
    return { ok: true, data: { ...link, montoCents, periodo } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}

// ---------------------------------------------------------------------------
// M4.3 · Conciliación de transferencias
// ---------------------------------------------------------------------------

export type MovimientoImportado = MovimientoExtracto & {
  idx: number
  pagoId: string
  propuesta: PropuestaMatch
}

export type ResultadoImportacion = {
  movimientos: MovimientoImportado[]
  deudores: { accountId: string; label: string }[]
  totalCents: number
}

function hashRow(fecha: string, montoCents: number, detalle: string, idx: number): string {
  return createHash('sha256')
    .update(`${fecha}|${montoCents}|${detalle}|${idx}`)
    .digest('hex')
    .slice(0, 20)
}

/**
 * Importa un extracto CSV: propone matcheos contra las cuentas deudoras
 * (monto exacto + nombre) y deja cada movimiento como pago pendiente sin
 * cuenta (transferencia no identificada). Volver a importar el mismo
 * extracto no duplica (externalRef = hash de la fila).
 */
export async function importarExtracto(clubSlug: string, input: unknown): Promise<ActionResult<ResultadoImportacion>> {
  const parsed = importarExtractoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Extracto inválido' }

  try {
    const ctx = await requirePermission('cobranzas.conciliar', { kind: 'club' }, clubSlug)

    const movimientos = parsearExtractoCSV(parsed.data.texto, parsed.data.separador)
    if (movimientos.length === 0) return { ok: false, error: 'No se detectaron ingresos en el extracto.' }

    const deudoras = await buscarCuentaParaCobrar(ctx.clubId, '')
    const deudores = deudoras.map((d) => ({
      accountId: d.id,
      holderApellido: d.holderApellido,
      holderNombre: d.holderNombre,
      saldoCents: d.balanceCents,
    }))
    const propuestas = proponerMatcheos(movimientos, deudores)

    const movsImportados: MovimientoImportado[] = await withTenant(ctx.clubId, async ({ tx }) => {
      const resultado: MovimientoImportado[] = []
      for (let i = 0; i < movimientos.length; i++) {
        const m = movimientos[i]!
        const externalRef = `transfer-${hashRow(m.fecha, m.montoCents, m.detalle, i)}`
        const [existente] = await tx
          .select({ id: payments.id })
          .from(payments)
          .where(and(eq(payments.clubId, ctx.clubId), eq(payments.externalRef, externalRef)))
          .limit(1)
        let pagoId = existente?.id
        if (!pagoId) {
          const [pago] = await tx
            .insert(payments)
            .values({
              clubId: ctx.clubId,
              method: 'transferencia',
              amount: centsToDecimal(m.montoCents),
              paidAt: new Date(m.fecha + 'T12:00:00Z'),
              status: 'pendiente',
              externalRef,
              rawPayload: { detalle: m.detalle, idx: i },
            })
            .returning()
          pagoId = pago!.id
        }
        resultado.push({ ...m, idx: i, pagoId, propuesta: propuestas[i]! })
      }
      return resultado
    })

    return {
      ok: true,
      data: {
        movimientos: movsImportados,
        deudores: deudores.map((d) => ({
          accountId: d.accountId,
          label: `${d.holderApellido}, ${d.holderNombre}`,
        })),
        totalCents: movsImportados.reduce((acc, m) => acc + m.montoCents, 0),
      },
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}

/**
 * Confirma la conciliación de un pago pendiente: le asigna la cuenta y lo
 * acredita (créditos FIFO en el ledger, cargo marcado pagado/parcial).
 */
export async function confirmarConciliacion(clubSlug: string, input: unknown): Promise<ActionResult<{ pagoId: string }>> {
  const accountId = typeof input === 'object' && input && 'accountId' in input ? String((input as { accountId: unknown }).accountId) : ''
  const pagoId = typeof input === 'object' && input && 'pagoId' in input ? String((input as { pagoId: unknown }).pagoId) : ''
  if (!accountId || !pagoId) return { ok: false, error: 'Datos inválidos' }

  try {
    const ctx = await requirePermission('cobranzas.conciliar', { kind: 'club' }, clubSlug)

    const resultado = await withTenant(ctx.clubId, async ({ tx }) => {
      const r = await acreditarPagoPendiente(tx, ctx.clubId, pagoId, accountId)
      await emitirNotificaciones(
        tx,
        ctx.clubId,
        r.holderUserId
          ? [
              {
                userId: r.holderUserId,
                type: 'pago.acreditado',
                title: 'Transferencia acreditada',
                body: `Acreditamos tu transferencia de ${formatARS(r.imputaciones.reduce((acc, i) => acc + i.amountCents, 0) + r.sobranteCents)}.`,
                data: { pagoId, accountId },
              },
            ]
          : [],
      )
      return r
    }, { userId: ctx.userId })

    return { ok: true, data: { pagoId: resultado.pagoId } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}
