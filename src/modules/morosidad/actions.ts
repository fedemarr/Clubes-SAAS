'use server'

import { sql } from 'drizzle-orm'
import { withTenant } from '@/db/tenant'
import { requirePermission } from '@/lib/permissions'
import { centsToDecimal, formatARS } from '@/lib/money'
import { emitirNotificaciones } from '@/lib/notifications/emit'
import {
  crearPlanDePagoSchema,
  eliminarReglaSchema,
  guardarPlantillaSchema,
  guardarReglaCobranzaSchema,
  planIdSchema,
  resolverSugerenciaSchema,
} from './schemas'
import { planDePago, type ReglaCobranza } from './service'
import { ejecutarCobranzaCore } from './runner'
import type { ResultadoEjecucionCobranza } from './runner'

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

/**
 * Corre el motor de reglas ahora mismo (también lo hace el cron). Requiere
 * morosidad.ver; la lógica compartida vive en ejecutarCobranzaCore() (runner).
 */
export async function ejecutarCobranza(clubSlug: string): Promise<ActionResult<ResultadoEjecucionCobranza>> {
  try {
    const ctx = await requirePermission('morosidad.ver', { kind: 'club' }, clubSlug)
    const data = await ejecutarCobranzaCore(ctx.clubId)
    return { ok: true, data }
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
      async ({ tx, audit, onCommit }) => {
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
          await emitirNotificaciones({ tx, onCommit }, ctx.clubId, [
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

/**
 * Cierra un plan de pago con estado final "cancelado". No elimina nada:
 * el plan y sus cuotas quedan auditables en contact_log/ledger.
 */
export async function cancelarPlanDePago(clubSlug: string, input: unknown): Promise<ActionResult<null>> {
  const parsed = planIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const ctx = await requirePermission('morosidad.configurar', { kind: 'club' }, clubSlug)
    await withTenant(
      ctx.clubId,
      async ({ tx, audit }) => {
        const { rows } = await tx.execute<{ id: string }>(sql`
          UPDATE payment_plans SET status = 'cancelado'
          WHERE id = ${parsed.data.id} AND club_id = ${ctx.clubId} AND status = 'activo'
          RETURNING id
        `)
        const plan = rows[0]
        if (!plan) throw new Error('No existe ese plan activo.')
        await audit('payment_plans', plan.id, 'custom', { action: 'cancelar_plan' })
      },
      { userId: ctx.userId },
    )
    return { ok: true, data: null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}

/**
 * Marca un plan como "completado" solo si el saldo pendiente ya está pago
 * (pagadoDesdeInicio >= total). El cierre automático se puede agregar en el
 * runner; acá el tesorero lo confirma a mano.
 */
export async function marcarPlanCompletado(clubSlug: string, input: unknown): Promise<ActionResult<null>> {
  const parsed = planIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const ctx = await requirePermission('morosidad.configurar', { kind: 'club' }, clubSlug)
    await withTenant(
      ctx.clubId,
      async ({ tx, audit }) => {
        const { rows } = await tx.execute<{ id: string; total: string; pagado: string }>(sql`
          UPDATE payment_plans pp
          SET status = 'completado'
          WHERE pp.id = ${parsed.data.id} AND pp.club_id = ${ctx.clubId} AND pp.status = 'activo'
            AND (SELECT COALESCE(SUM(CASE WHEN le.direction = 'credito' THEN le.amount ELSE 0 END), 0)
                 FROM ledger_entries le WHERE le.account_id = pp.account_id AND le.booked_at >= pp.created_at) >= pp.total
          RETURNING pp.id, pp.total, pp.created_at
        `)
        const plan = rows[0]
        if (!plan) throw new Error('El plan todavía tiene saldo impago.')
        await audit('payment_plans', plan.id, 'custom', { action: 'completar_plan' })
      },
      { userId: ctx.userId },
    )
    return { ok: true, data: null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}

export type { ReglaCobranza }