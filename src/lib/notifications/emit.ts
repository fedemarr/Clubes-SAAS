import { sql } from 'drizzle-orm'
import type { TenantCtx } from '@/db/tenant'
import { enviarPush } from './push'

export type NotificacionInput = {
  userId: string
  type: string
  title: string
  body?: string
  data?: Record<string, unknown>
}

/**
 * Capa de eventos de dominio (transversal del brief). La lógica de negocio
 * nunca llama a un canal (WhatsApp, mail, push) directamente: emite una
 * notificación a la bandeja de `notifications` (tabla fuera de schema.ts,
 * ver DECISIONS.md M2.2) y, tras el commit, dispara el push por
 * `ctx.onCommit` — con la transacción cerrada, igual que los mails.
 */
export async function emitirNotificaciones(
  ctx: Pick<TenantCtx, 'tx' | 'onCommit'>,
  clubId: string,
  inputs: NotificacionInput[],
): Promise<number> {
  if (inputs.length === 0) return 0

  // Idempotencia por transacción: mismo usuario + tipo + título + data es un
  // mismo evento, aunque la acción se repita (ej. re-publicar una
  // convocatoria sin cambios no duplica avisos).
  const unicos = new Map<string, NotificacionInput>()
  for (const n of inputs) {
    unicos.set(JSON.stringify({ userId: n.userId, type: n.type, title: n.title, data: n.data ?? null }), n)
  }

  const emitidos: NotificacionInput[] = []
  for (const n of unicos.values()) {
    await ctx.tx.execute(sql`
      INSERT INTO notifications (club_id, user_id, type, title, body, data)
      VALUES (
        ${clubId},
        ${n.userId},
        ${n.type},
        ${n.title},
        ${n.body ?? null},
        ${n.data ? JSON.stringify(n.data) : null}::jsonb
      )
    `)
    console.log(`[notif:dev] user=${n.userId} type=${n.type} title="${n.title}"`)
    emitidos.push(n)
  }

  ctx.onCommit(() => {
    void enviarPush(clubId, emitidos)
  })

  return emitidos.length
}
