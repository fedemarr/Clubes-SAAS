'use server'

import { createHash } from 'crypto'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { accounts, payments, persons } from '@/db/schema'
import { withTenant } from '@/db/tenant'
import { requirePermission } from '@/lib/permissions'
import { centsToDecimal, decimalToCents, formatARS } from '@/lib/money'
import { emitirNotificaciones, type NotificacionInput } from '@/lib/notifications/emit'
import {
  acreditarLoteDebitoSchema,
  generarLoteDebitoSchema,
  generarLinkPagoSchema,
  importarExtractoSchema,
  importarRechazosDebitoSchema,
  registrarCbuDebitoSchema,
  registrarPagoSchema,
  revertirPagoSchema,
} from './schemas'
import {
  generarNumeroLote,
  parsearExtractoCSV,
  parsearRechazosCSV,
  proponerMatcheos,
  serializarLoteCSV,
} from './service'
import type { MovimientoExtracto, PropuestaMatch, RegistroLoteDebito } from './service'
import { acreditarPagoEnLedger, acreditarPagoPendiente, revertirPagoEnLedger } from './acreditacion'
import { crearPreferenciaPago } from './mercadopago'
import { buscarCuentaParaCobrar, cuentasDebitables, deudaDeCuenta, listarLotesDebito, pagosDelLote } from './queries'
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

    const recibo = await withTenant(ctx.clubId, async ({ tx, onCommit }) => {
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
        { tx, onCommit },
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
      await revertirPagoEnLedger(tx, ctx.clubId, parsed.data.pagoId, parsed.data.motivo)
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

    const resultado = await withTenant(ctx.clubId, async ({ tx, onCommit }) => {
      const r = await acreditarPagoPendiente(tx, ctx.clubId, pagoId, accountId)
      await emitirNotificaciones(
        { tx, onCommit },
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

// ---------------------------------------------------------------------------
// M4.4 · Débito automático
// ---------------------------------------------------------------------------

/**
 * Guarda (o quita) el CBU para débito en el titular de la cuenta. Vive en
 * persons.custom.debitoCbu (schema fijo de app, ver DECISIONS.md — M4.4).
 */
export async function registrarCbuDebito(
  clubSlug: string,
  input: unknown,
): Promise<ActionResult<{ accountId: string; cbu: string | null }>> {
  const parsed = registrarCbuDebitoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const ctx = await requirePermission('cobranzas.registrar', { kind: 'club' }, clubSlug)
    const cbu = parsed.data.cbu === '' ? null : parsed.data.cbu

    const guardado = await withTenant(
      ctx.clubId,
      async ({ tx }) => {
        const [cuenta] = await tx
          .select()
          .from(accounts)
          .where(and(eq(accounts.clubId, ctx.clubId), eq(accounts.id, parsed.data.accountId), isNull(accounts.deletedAt)))
          .limit(1)
        if (!cuenta) throw new Error('No existe esa cuenta.')
        const [holder] = await tx.select().from(persons).where(eq(persons.id, cuenta.holderPersonId)).limit(1)
        if (!holder) throw new Error('La cuenta no tiene titular.')

        await tx
          .update(persons)
          .set({ custom: { ...(holder.custom ?? {}), debitoCbu: cbu } })
          .where(eq(persons.id, holder.id))
        return { accountId: cuenta.id, cbu }
      },
      { userId: ctx.userId },
    )
    return { ok: true, data: guardado }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}

export type ResultadoLoteDebito = {
  loteId: string
  numero: string
  fechaEjecucion: string
  registros: number
  totalCents: number
  archivo: string
  filename: string
}

/**
 * Genera el lote de débito: toma todas las cuentas con CBU y saldo deudor,
 * crea un payment 'pendiente' por cuenta (externalRef debito:<numero>:<id>) y
 * devuelve el CSV con formato genérico para subir al banco. No acredita nada.
 */
export async function generarLoteDebito(clubSlug: string, input: unknown): Promise<ActionResult<ResultadoLoteDebito>> {
  const parsed = generarLoteDebitoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const ctx = await requirePermission('cobranzas.registrar', { kind: 'club' }, clubSlug)

    const candidatas = await cuentasDebitables(ctx.clubId)
    if (candidatas.length === 0) {
      return { ok: false, error: 'No hay cuentas con CBU cargado y saldo deudor para debitar.' }
    }

    const [ultimo] = (await listarLotesDebito(ctx.clubId)).map((l) => l.numero)
    const numero = generarNumeroLote(new Date().getFullYear(), ultimo ?? null)
    const totalCents = candidatas.reduce((acc, c) => acc + c.deudaCents, 0)
    const periodo = parsed.data.fechaEjecucion.slice(0, 7)

    const registros: RegistroLoteDebito[] = candidatas.map((c) => ({
      cbu: c.cbu,
      titular: `${c.holderApellido}, ${c.holderNombre}`,
      montoCents: c.deudaCents,
      periodo,
      referencia: `debito:${numero}:${c.accountId}`,
    }))

    const loteId = await withTenant(
      ctx.clubId,
      async ({ tx, audit }) => {
        for (const c of candidatas) {
          await tx.insert(payments).values({
            clubId: ctx.clubId,
            accountId: c.accountId,
            method: 'debito_automatico',
            amount: centsToDecimal(c.deudaCents),
            paidAt: new Date(`${parsed.data.fechaEjecucion}T12:00:00Z`),
            status: 'pendiente',
            externalRef: `debito:${numero}:${c.accountId}`,
            rawPayload: { lote: numero, cbu: c.cbu, titular: `${c.holderApellido}, ${c.holderNombre}` },
            recordedBy: ctx.userId,
          })
        }

        const { rows: loteRows } = await tx.execute<{ id: string }>(sql`
          INSERT INTO debito_lotes (club_id, numero, banco, fecha_ejecucion, status, monto_total, registros, generado_por)
          VALUES (${ctx.clubId}, ${numero}, ${parsed.data.banco}, ${parsed.data.fechaEjecucion}, 'generado', ${centsToDecimal(totalCents)}, ${candidatas.length}, ${ctx.userId})
          RETURNING id
        `)
        const lote = loteRows[0]
        if (!lote) throw new Error('No se pudo crear el lote.')

        await audit('debito_lotes', lote.id, 'create', {
          numero,
          banco: parsed.data.banco,
          fechaEjecucion: parsed.data.fechaEjecucion,
          registros: candidatas.length,
          montoCents: totalCents,
        })
        return lote.id
      },
      { userId: ctx.userId },
    )

    return {
      ok: true,
      data: {
        loteId,
        numero,
        fechaEjecucion: parsed.data.fechaEjecucion,
        registros: candidatas.length,
        totalCents,
        archivo: serializarLoteCSV(registros),
        filename: `lote-debito-${numero}-${parsed.data.fechaEjecucion}.csv`,
      },
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}

export type ResultadoAcreditacionLote = { loteId: string; acreditados: number; montoCents: number }

/**
 * Acredita el lote como cobrado por el banco: pasa cada payment pendiente del
 * lote a 'acreditado' e imputa los créditos en el ledger (FIFO). Llamar solo
 * cuando el banco confirma el débito (hoy manual, luego webhook del banco).
 */
export async function acreditarLoteDebito(clubSlug: string, input: unknown): Promise<ActionResult<ResultadoAcreditacionLote>> {
  const parsed = acreditarLoteDebitoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const ctx = await requirePermission('cobranzas.registrar', { kind: 'club' }, clubSlug)

    const resultado = await withTenant(
      ctx.clubId,
      async ({ tx, audit, onCommit }) => {
        const { rows: loteRows } = await tx.execute<{ id: string; numero: string; registros: number; acreditados: number; rechazados: number }>(
          sql`SELECT id, numero, registros, acreditados, rechazados FROM debito_lotes WHERE id = ${parsed.data.loteId} AND club_id = ${ctx.clubId}`,
        )
        const lote = loteRows[0]
        if (!lote) throw new Error('No existe ese lote.')

        const pagos = await pagosDelLote(tx, ctx.clubId, lote.numero)
        const pendientes = pagos.filter((p) => p.status === 'pendiente' && p.accountId)

        let acreditados = 0
        let montoCents = 0
        const notif: NotificacionInput[] = []

        for (const p of pendientes) {
          const r = await acreditarPagoPendiente(tx, ctx.clubId, p.id, p.accountId!)
          acreditados += 1
          montoCents += decimalToCents(p.amount)
          if (r.holderUserId) {
            notif.push({
              userId: r.holderUserId,
              type: 'pago.acreditado',
              title: 'Débito acreditado',
              body: `Acreditamos tu cuota por débito automático (${formatARS(decimalToCents(p.amount))}).`,
              data: { pagoId: p.id, accountId: p.accountId },
            })
          }
        }

        const totalAcreditados = lote.acreditados + acreditados
        const nuevoStatus = totalAcreditados >= lote.registros ? 'acreditado' : 'generado'
        await tx.execute(sql`UPDATE debito_lotes SET acreditados = ${totalAcreditados}, status = ${nuevoStatus} WHERE id = ${lote.id}`)
        await audit('debito_lotes', lote.id, 'update', { acreditados: totalAcreditados, status: nuevoStatus })

        if (notif.length > 0) await emitirNotificaciones({ tx, onCommit }, ctx.clubId, notif)
        return { loteId: lote.id, acreditados, montoCents }
      },
      { userId: ctx.userId },
    )
    return { ok: true, data: resultado }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}

export type ResultadoRechazosDebito = {
  loteId: string
  procesados: number
  rechazados: number
  reversados: number
  sinMatch: { cbu: string | null; montoCents: number; motivo: string }[]
}

/**
 * Importa el archivo de rechazos del banco: marca 'rechazado' los payments
 * pendientes que coinciden (por referencia o por CBU+monto) y revierte los que
 * ya estaban acreditados con asiento inverso (nunca borra el original).
 */
export async function importarRechazosDebito(
  clubSlug: string,
  input: unknown,
): Promise<ActionResult<ResultadoRechazosDebito>> {
  const parsed = importarRechazosDebitoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const ctx = await requirePermission('cobranzas.registrar', { kind: 'club' }, clubSlug)

    const rechazos = parsearRechazosCSV(parsed.data.texto, parsed.data.separador)
    if (rechazos.length === 0) return { ok: false, error: 'No se detectaron rechazos en el archivo.' }

    const resultado = await withTenant(
      ctx.clubId,
      async ({ tx, audit, onCommit }) => {
        const { rows: loteRows } = await tx.execute<{ id: string; numero: string; registros: number; rechazados: number }>(
          sql`SELECT id, numero, registros, rechazados FROM debito_lotes WHERE id = ${parsed.data.loteId} AND club_id = ${ctx.clubId}`,
        )
        const lote = loteRows[0]
        if (!lote) throw new Error('No existe ese lote.')

        const pagos = await pagosDelLote(tx, ctx.clubId, lote.numero)
        const porRef = new Map(pagos.map((p) => [p.externalRef ?? '', p]))

        let rechazados = 0
        let reversados = 0
        const sinMatch: ResultadoRechazosDebito['sinMatch'] = []
        const accountIds = new Set<string>()

        for (const r of rechazos) {
          let pago = r.referencia ? porRef.get(r.referencia) : undefined
          if (!pago) {
            pago = pagos.find(
              (p) =>
                (p.status === 'pendiente' || p.status === 'acreditado') &&
                (p.rawPayload as { cbu?: string } | null)?.cbu === r.cbu &&
                decimalToCents(p.amount) === r.montoCents,
            )
          }
          if (!pago) {
            sinMatch.push({ cbu: r.cbu, montoCents: r.montoCents, motivo: r.motivo })
            continue
          }

          if (pago.status === 'pendiente') {
            await tx.update(payments).set({ status: 'rechazado' }).where(eq(payments.id, pago.id))
            rechazados += 1
          } else if (pago.status === 'acreditado') {
            await revertirPagoEnLedger(tx, ctx.clubId, pago.id, `Rechazo del banco: ${r.motivo || 'sin motivo'}`)
            reversados += 1
          } else {
            continue
          }
          if (pago.accountId) accountIds.add(pago.accountId)
        }

        const notif: NotificacionInput[] = []
        if (accountIds.size > 0) {
          const holders = await tx
            .select({ userId: persons.userId, accountId: accounts.id })
            .from(accounts)
            .innerJoin(persons, eq(persons.id, accounts.holderPersonId))
            .where(and(inArray(accounts.id, [...accountIds]), eq(accounts.clubId, ctx.clubId)))
          for (const h of holders) {
            if (h.userId) {
              notif.push({
                userId: h.userId,
                type: 'pago.rechazado',
                title: 'Débito rechazado',
                body: 'El banco no pudo debitar la cuota. Revisá el CBU o la cuenta de origen.',
                data: { accountId: h.accountId },
              })
            }
          }
        }

        const totalRechazos = lote.rechazados + rechazados + reversados
        await tx.execute(sql`UPDATE debito_lotes SET rechazados = ${totalRechazos}, status = 'cerrado' WHERE id = ${lote.id}`)
        await audit('debito_lotes', lote.id, 'update', { rechazados: totalRechazos, status: 'cerrado' })

        if (notif.length > 0) await emitirNotificaciones({ tx, onCommit }, ctx.clubId, notif)
        return { loteId: lote.id, procesados: rechazados + reversados, rechazados, reversados, sinMatch }
      },
      { userId: ctx.userId },
    )
    return { ok: true, data: resultado }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}
