'use server'

import { and, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { withTenant } from '@/db/tenant'
import { accounts, memberships } from '@/db/schema'
import { requirePermission } from '@/lib/permissions'
import { crearPreferenciaPago } from '@/modules/cobranzas/mercadopago'
import { personasDelMiembroTx } from './queries'

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

const linkSchema = z.object({
  accountId: z.string().uuid(),
  montoCents: z.number().int().positive('El monto tiene que ser mayor a cero'),
})

/**
 * Crea el link de Checkout Pro (Mercado Pago) para la cuenta del socio.
 * El socio no puede pagar la cuenta de otro: solo se deja armar la
 * preferencia si la cuenta pertenece al grupo familiar del usuario.
 */
export async function crearLinkPago(clubSlug: string, input: unknown): Promise<ActionResult<{ url: string }>> {
  const parsed = linkSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const ctx = await requirePermission('notificaciones.ver', { kind: 'club' }, clubSlug)
    const periodo = new Date().toISOString().slice(0, 7)

    const resultado = await withTenant(ctx.clubId, async ({ tx }) => {
      const personIds = await personasDelMiembroTx(tx, ctx.clubId, ctx.personId)
      const membresias = await tx
        .select({ accountId: memberships.accountId })
        .from(memberships)
        .where(and(eq(memberships.clubId, ctx.clubId), inArray(memberships.personId, personIds)))
      const holders = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(
          and(
            eq(accounts.clubId, ctx.clubId),
            inArray(accounts.holderPersonId, personIds),
            isNull(accounts.deletedAt),
          ),
        )
      const cuentasPropias = new Set([...membresias.map((m) => m.accountId), ...holders.map((h) => h.id)])

      if (!cuentasPropias.has(parsed.data.accountId)) {
        return { error: 'Esa cuenta no es tuya.' } as const
      }

      return crearPreferenciaPago(ctx.clubId, parsed.data.accountId, parsed.data.montoCents, periodo)
    })

    if ('error' in resultado) return { ok: false, error: resultado.error }
    return { ok: true, data: { url: resultado.url } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo generar el link de pago.' }
  }
}
