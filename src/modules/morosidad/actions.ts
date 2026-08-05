'use server'

import { sql } from 'drizzle-orm'
import { withTenant } from '@/db/tenant'
import { requirePermission } from '@/lib/permissions'
import { centsToDecimal, formatARS } from '@/lib/money'
import { emitirNotificaciones, type NotificacionInput } from '@/lib/notifications/emit'
import {
  crearPlanDePagoSchema,
  eliminarReglaSchema,
  guardarPlantillaSchema,
  guardarReglaCobranzaSchema,
  resolverSugerenciaSchema,
} from './schemas'
import { evaluarReglasCobranza, planDePago, type ReglaCobranza } from './service'
import {
  coordinadoresPorDeporte,
  deudoresMorosidad,
  listarContactosRecientes,
  listarReglasCobranza,
  plantillasPorKey,
} from './queries'

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

// ---------------------------------------------------------------------------
// M5.2 · Configuración de reglas y plantillas
// ---------------------------------------------------------------------------

export async function guardarReglaCobranza(clubSlug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = guardarReglaCobranzaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const ctx = await requirePermission('morosidad.configurar', { kind: 'club' }, clubSlug)

    const id = await withTenant(
      ctx.clubId,
      async ({ tx, audit }) => {
        if (parsed.data.id) {
          const { rows } = await tx.execute<{ id: string }>(sql`
            UPDATE cobranza_rules
            SET name = ${parsed.data.name}, dias_desde_vencimiento = ${parsed.data.dias},
                channel = ${parsed.data.channel}, template_key = ${parsed.data.templateKey ?? null},
                dedupe_dias = ${parsed.data.dedupeDias}, enabled = ${parsed.data.enabled}
            WHERE id = ${parsed.data.id} AND club_id = ${ctx.clubId}
            RETURNING id
          `)
          const regla = rows[0]
          if (!regla) throw new Error('No existe esa regla.')
          await audit('cobranza_rules', regla.id, 'update', parsed.data)
          return regla.id
        }

        const { rows } = await tx.execute<{ id: string }>(sql`
          INSERT INTO cobranza_rules (club_id, name, dias_desde_vencimiento, channel, template_key, dedupe_dias, enabled, created_by)
          VALUES (${ctx.clubId}, ${parsed.data.name}, ${parsed.data.dias}, ${parsed.data.channel},
                  ${parsed.data.templateKey ?? null}, ${parsed.data.dedupeDias}, ${parsed.data.enabled}, ${ctx.userId})
          RETURNING id
        `)
        const regla = rows[0]
        if (!regla) throw new Error('No se pudo crear la regla.')
        await audit('cobranza_rules', regla.id, 'create', parsed.data)
        return regla.id
      },
      { userId: ctx.userId },
    )
    return { ok: true, data: { id } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}

/** Desactiva la regla (nada se borra; las reglas que ya dispararon tienen log). */
export async function eliminarReglaCobranza(clubSlug: string, input: unknown): Promise<ActionResult<null>> {
  const parsed = eliminarReglaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const ctx = await requirePermission('morosidad.configurar', { kind: 'club' }, clubSlug)
    await withTenant(
      ctx.clubId,
      async ({ tx, audit }) => {
        await tx.execute(sql`UPDATE cobranza_rules SET enabled = false WHERE id = ${parsed.data.id} AND club_id = ${ctx.clubId}`)
        await audit('cobranza_rules', parsed.data.id, 'custom', { action: 'disable' })
      },
      { userId: ctx.userId },
    )
    return { ok: true, data: null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}

export async function guardarPlantilla(clubSlug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = guardarPlantillaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const ctx = await requirePermission('morosidad.configurar', { kind: 'club' }, clubSlug)

    const id = await withTenant(
      ctx.clubId,
      async ({ tx, audit }) => {
        const { rows: existentes } = await tx.execute<{ id: string }>(sql`
          SELECT id FROM message_templates WHERE club_id = ${ctx.clubId} AND key = ${parsed.data.key}
        `)
        const existente = parsed.data.id ?? existentes[0]?.id ?? null

        const { rows } = existente
          ? await tx.execute<{ id: string }>(sql`
              UPDATE message_templates SET key = ${parsed.data.key}, name = ${parsed.data.name},
                body = ${parsed.data.body}, updated_by = ${ctx.userId}, updated_at = now()
              WHERE id = ${existente} AND club_id = ${ctx.clubId}
              RETURNING id
            `)
          : await tx.execute<{ id: string }>(sql`
              INSERT INTO message_templates (club_id, key, name, body, updated_by)
              VALUES (${ctx.clubId}, ${parsed.data.key}, ${parsed.data.name}, ${parsed.data.body}, ${ctx.userId})
              RETURNING id
            `)
        const plantilla = rows[0]
        if (!plantilla) throw new Error('No se pudo guardar la plantilla.')
        await audit('message_templates', plantilla.id, existente ? 'update' : 'create', { key: parsed.data.key })
        return plantilla.id
      },
      { userId: ctx.userId },
    )
    return { ok: true, data: { id } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}

// ---------------------------------------------------------------------------
// M5.1 · Runner manual del motor de reglas
// ---------------------------------------------------------------------------

export type ResultadoEjecucionCobranza = {
  mensajes: number
  avisosCoordinador: number
  sugerencias: number
  omitidos: number
  porMotivo: Record<string, number>
}

/**
 * Corre el motor de reglas ahora mismo (también lo hará el cron): decide a
 * quién contactar, registra todo en contact_log (para no duplicar y para
 * poder demostrarlo) y emite las notificaciones por el canal transversal.
 * La suspensión solo se sugiere; un humano la resuelve.
 */
export async function ejecutarCobranza(clubSlug: string): Promise<ActionResult<ResultadoEjecucionCobranza>> {
  try {
    const ctx = await requirePermission('morosidad.ver', { kind: 'club' }, clubSlug)

    const [deudores, reglas, plantillas, coordinadores] = await Promise.all([
      deudoresMorosidad(ctx.clubId),
      listarReglasCobranza(ctx.clubId),
      plantillasPorKey(ctx.clubId),
      coordinadoresPorDeporte(ctx.clubId),
    ])
    const activas = reglas.filter((r) => r.enabled)
    if (activas.length === 0) return { ok: true, data: { mensajes: 0, avisosCoordinador: 0, sugerencias: 0, omitidos: deudores.length, porMotivo: { 'sin reglas activas': deudores.length } } }

    const maxDedupe = Math.max(1, ...activas.map((r) => r.dedupeDias))
    const desde = new Date(Date.now() - maxDedupe * 86400000)
    const recientes = await listarContactosRecientes(
      ctx.clubId,
      deudores.map((d) => d.accountId),
      desde,
    )

    const deudorACobranza = deudores.map((d) => ({
      accountId: d.accountId,
      deudaCents: d.deudaCents,
      diasDesdeVencimiento: d.diasDesdeVencimiento,
      destino: d.destino
        ? { userId: d.destino.userId, nombre: d.destino.nombre, apellido: d.destino.apellido }
        : null,
    }))
    const holderPorCuenta = new Map(deudores.map((d) => [d.accountId, d] as const))

    const { disparos, omitidos } = evaluarReglasCobranza({
      deudores: deudorACobranza,
      reglas: activas,
      plantillas,
      contactosRecientes: recientes,
      varsDeudor: (d) => {
        const h = holderPorCuenta.get(d.accountId)
        return {
          nombre: h?.destino?.nombre ?? h?.holderNombre ?? '',
          apellido: h?.destino?.apellido ?? h?.holderApellido ?? '',
          monto: formatARS(d.deudaCents),
        }
      },
    })

    const resultado = await withTenant(
      ctx.clubId,
      async ({ tx, audit }) => {
        const notif: NotificacionInput[] = []
        let mensajes = 0
        let avisosCoordinador = 0
        let sugerencias = 0

        for (const s of disparos) {
          let userId: string | null = null
          if (s.kind === 'mensaje') {
            userId = s.destinoUserId
            mensajes += 1
            if (s.destinoUserId) {
              notif.push({
                userId: s.destinoUserId,
                type: 'cobranza.recordatorio',
                title: s.name,
                body: s.body ?? '',
                data: { accountId: s.accountId, ruleId: s.ruleId },
              })
            }
          } else if (s.channel === 'coordinador') {
            const d = holderPorCuenta.get(s.accountId)
            const coord = coordinadores.find((c) => d?.deportes.includes(c.sport))
            userId = coord?.userId ?? null
            avisosCoordinador += 1
            if (coord?.userId) {
              const h = holderPorCuenta.get(s.accountId)
              notif.push({
                userId: coord.userId,
                type: 'cobranza.aviso_coordinador',
                title: s.name,
                body: `Deuda sin resolver: ${h?.holderApellido ?? ''}, ${h?.holderNombre ?? ''} (${h?.deudaCents ? formatARS(h.deudaCents) : ''}).`,
                data: { accountId: s.accountId, ruleId: s.ruleId },
              })
            }
          } else {
            sugerencias += 1
          }

          await tx.execute(sql`
            INSERT INTO contact_log (club_id, account_id, rule_id, user_id, channel, kind, body)
            VALUES (${ctx.clubId}, ${s.accountId}, ${s.ruleId}, ${userId}, ${s.channel}, ${s.kind}, ${s.body ?? null})
          `)
          await audit('contact_log', s.accountId, 'custom', {
            action: 'cobranza.disparo',
            ruleId: s.ruleId,
            channel: s.channel,
            kind: s.kind,
          })
        }

        if (notif.length > 0) await emitirNotificaciones(tx, ctx.clubId, notif)
        return { mensajes, avisosCoordinador, sugerencias }
      },
      { userId: ctx.userId },
    )

    const porMotivo: Record<string, number> = {}
    for (const o of omitidos) porMotivo[o.motivo] = (porMotivo[o.motivo] ?? 0) + 1

    return { ok: true, data: { ...resultado, omitidos: omitidos.length, porMotivo } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}

/** Cierra una sugerencia de suspensión (requiere confirmación humana). */
export async function resolverSugerencia(clubSlug: string, input: unknown): Promise<ActionResult<null>> {
  const parsed = resolverSugerenciaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const ctx = await requirePermission('morosidad.configurar', { kind: 'club' }, clubSlug)
    await withTenant(
      ctx.clubId,
      async ({ tx, audit }) => {
        const { rows } = await tx.execute<{ id: string }>(sql`
          UPDATE contact_log SET resolved_at = now()
          WHERE id = ${parsed.data.id} AND club_id = ${ctx.clubId} AND kind = 'sugerencia' AND resolved_at IS NULL
          RETURNING id
        `)
        const s = rows[0]
        if (!s) throw new Error('No existe esa sugerencia abierta.')
        await audit('contact_log', s.id, 'custom', { action: 'cobranza.suspension_resuelta', resolvedBy: ctx.userId })
      },
      { userId: ctx.userId },
    )
    return { ok: true, data: null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}

// ---------------------------------------------------------------------------
// M5.3 · Planes de pago
// ---------------------------------------------------------------------------

export async function crearPlanDePago(clubSlug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = crearPlanDePagoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const ctx = await requirePermission('morosidad.configurar', { kind: 'club' }, clubSlug)

    const id = await withTenant(
      ctx.clubId,
      async ({ tx, audit }) => {
        const { rows } = await tx.execute<{ balance: string; holder_user_id: string | null; holder_apellido: string; holder_nombre: string }>(sql`
          SELECT bal.balance, p.user_id AS holder_user_id, p.last_name AS holder_apellido, p.first_name AS holder_nombre
          FROM account_balances bal
          JOIN accounts a ON a.id = bal.account_id
          JOIN persons p ON p.id = a.holder_person_id
          WHERE bal.club_id = ${ctx.clubId} AND bal.account_id = ${parsed.data.accountId}
        `)
        const cuenta = rows[0]
        if (!cuenta) throw new Error('No existe esa cuenta.')

        const cuotas = planDePago(parsed.data.totalCents, parsed.data.cuotas, parsed.data.primeraFecha)
        if (cuotas.length === 0) throw new Error('El total debe ser mayor a cero.')

        const { rows: insertados } = await tx.execute<{ id: string }>(sql`
          INSERT INTO payment_plans (club_id, account_id, total, cantidad_cuotas, monto_cuota, primera_fecha, status, motivo, created_by)
          VALUES (${ctx.clubId}, ${parsed.data.accountId}, ${centsToDecimal(parsed.data.totalCents)},
                  ${parsed.data.cuotas}, ${centsToDecimal(cuotas[0]!.montoCents)}, ${parsed.data.primeraFecha},
                  'activo', ${parsed.data.motivo ?? null}, ${ctx.userId})
          RETURNING id
        `)
        const plan = insertados[0]
        if (!plan) throw new Error('No se pudo crear el plan.')

        await audit('payment_plans', plan.id, 'create', {
          accountId: parsed.data.accountId,
          totalCents: parsed.data.totalCents,
          cuotas: parsed.data.cuotas,
          primeraFecha: parsed.data.primeraFecha,
          motivo: parsed.data.motivo ?? null,
        })

        if (cuenta.holder_user_id) {
          await emitirNotificaciones(tx, ctx.clubId, [
            {
              userId: cuenta.holder_user_id,
              type: 'cobranza.plan_de_pago',
              title: 'Plan de pago aprobado',
              body: `Te aprobamos un plan de ${parsed.data.cuotas} cuotas de ${formatARS(cuotas[0]!.montoCents)}. Primera cuota: ${parsed.data.primeraFecha}.`,
              data: { accountId: parsed.data.accountId, planId: plan.id },
            },
          ])
        }
        return plan.id
      },
      { userId: ctx.userId },
    )
    return { ok: true, data: { id } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}

export type { ReglaCobranza }
