import { sql } from 'drizzle-orm'
import { createAuditor, type AuditFn } from '@/lib/audit'
import { db } from './client'

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type TenantActor = {
  userId?: string | null
  ip?: string | null
}

/**
 * Callback que se ejecuta DESPUÉS de que la transacción commitea (o no se
 * ejecuta si revierte). Es el único lugar permitido para efectos
 * post-commit (mails, push): nunca hacer una llamada HTTP con la
 * transacción abierta.
 */
export type PostCommit = () => Promise<void> | void

export type TenantCtx = {
  tx: Tx
  audit: AuditFn
  onCommit: (fn: PostCommit) => void
}

/**
 * Toda query de dominio pasa por acá. Los `true` finales de set_config
 * hacen el setting LOCAL a la transacción: no se filtran a otro request
 * del pool.
 *
 * app.current_actor viaja como JSON ({user_id, ip}) en un solo setting en
 * vez de dos, para no gastar un round-trip extra por valor. app.current_batch
 * es opcional: lo usan las operaciones masivas (importaciones de M1) para
 * poder agrupar en la auditoría N filas de una misma corrida — ver
 * DECISIONS.md.
 *
 * El `audit` que recibe el callback y el trigger audit_table_changes()
 * (rls.sql) leen exactamente estos mismos settings, así que una fila
 * escrita a mano con audit() y las que genera el trigger quedan
 * consistentes entre sí.
 */
export async function withTenant<T>(
  clubId: string,
  fn: (ctx: TenantCtx) => Promise<T>,
  actor?: TenantActor,
  batchId?: string,
): Promise<T> {
  const actorValue = actor ? JSON.stringify({ user_id: actor.userId ?? null, ip: actor.ip ?? null }) : ''
  const batchValue = batchId ?? ''
  const postCommit: PostCommit[] = []

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT
        set_config('app.current_club', ${clubId}, true),
        set_config('app.current_actor', ${actorValue}, true),
        set_config('app.current_batch', ${batchValue}, true)
    `)
    const audit = createAuditor(tx)
    return fn({ tx, audit, onCommit: (fn) => postCommit.push(fn) })
  })

  // Los callbacks post-commit son best-effort (canales como mail/push):
  // corren con la transacción ya cerrada y un fallo no revierte nada.
  for (const fn of postCommit) {
    try {
      await fn()
    } catch (err) {
      console.error('[withTenant:onCommit]', err)
    }
  }

  return result
}
