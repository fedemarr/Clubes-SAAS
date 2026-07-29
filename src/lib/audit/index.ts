import { sql } from 'drizzle-orm'
import type { Tx } from '@/db/tenant'

export type AuditAction = 'create' | 'update' | 'delete' | 'custom'

export type AuditFn = (
  entity: string,
  entityId: string | null,
  action: AuditAction,
  diff?: Record<string, unknown>,
) => Promise<void>

/**
 * Inserta con SQL crudo, no con el builder tipado de Drizzle, a propósito:
 * club_id/actor_user_id/ip/batch_id se derivan de los mismos
 * current_setting() que lee audit_table_changes() (el trigger genérico de
 * rls.sql), para que la fila que escribe la app y las que escribe el
 * trigger sean consistentes entre sí sin duplicar la lectura del contexto.
 * batch_id además no existe en el `auditLog` de schema.ts (ver
 * DECISIONS.md — vive solo en la base), así que tampoco podría pasar por
 * el builder tipado.
 */
export function createAuditor(tx: Tx): AuditFn {
  const seen = new Set<string>()

  return async function audit(entity, entityId, action, diff) {
    const key = JSON.stringify({ entity, entityId, action, diff: diff ?? null })
    if (seen.has(key)) return
    seen.add(key)

    await tx.execute(sql`
      INSERT INTO audit_log (club_id, actor_user_id, ip, batch_id, entity, entity_id, action, diff, at)
      VALUES (
        current_club(),
        (nullif(current_setting('app.current_actor', true), '')::jsonb ->> 'user_id')::uuid,
        (nullif(current_setting('app.current_actor', true), '')::jsonb ->> 'ip'),
        nullif(current_setting('app.current_batch', true), '')::uuid,
        ${entity},
        ${entityId},
        ${action},
        ${diff ? JSON.stringify(diff) : null}::jsonb,
        now()
      )
    `)
  }
}
