import { auditLog } from '@/db/schema'
import type { Tx } from '@/db/tenant'

type AuditContext = {
  clubId: string
  actorUserId?: string | null
  ip?: string | null
}

/**
 * audit(entity, entityId, action, diff) — se liga a la transacción y al club
 * actuales con createAuditor(tx, ctx), para poder escribir siempre dentro
 * de la misma tx de withTenant() sin repetir clubId/actorUserId/ip en cada
 * llamado.
 */
export function createAuditor(tx: Tx, ctx: AuditContext) {
  return async function audit(
    entity: string,
    entityId: string | null,
    action: string,
    diff?: Record<string, unknown>,
  ) {
    await tx.insert(auditLog).values({
      clubId: ctx.clubId,
      actorUserId: ctx.actorUserId ?? null,
      entity,
      entityId,
      action,
      diff: diff ?? null,
      ip: ctx.ip ?? null,
    })
  }
}
