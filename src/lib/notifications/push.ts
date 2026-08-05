import { sql } from 'drizzle-orm'
import webpush from 'web-push'
import { withTenant } from '@/db/tenant'
import type { NotificacionInput } from './emit'

/**
 * Canal push (M6): suscripciones de Web Push por club (tabla
 * push_subscriptions, rls.sql sección 12). Envía best-effort DESPUÉS del
 * commit de la transacción (lo programa emitirNotificaciones vía
 * withTenant.onCommit), con el mismo criterio que sendMail: sin VAPID
 * configurado loguea a consola y sigue. Los endpoints que el push service
 * da por muertos (410/404) se borran para no ensuciar la tabla.
 */

type SubscriptionRow = {
  id: string
  user_id: string
  endpoint: string
  keys_p256dh: string
  keys_auth: string
}

function vapidConfigurado(): boolean {
  return Boolean(
    process.env.VAPID_SUBJECT && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
  )
}

function setupVapid(): void {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
}

/**
 * Envía un push por cada notificación emitida a cada suscripción del
 * destinatario. Nunca tira: es el mismo patrón best-effort del mail.
 */
export async function enviarPush(clubId: string, inputs: NotificacionInput[]): Promise<number> {
  if (inputs.length === 0) return 0
  if (!vapidConfigurado()) {
    for (const n of inputs) {
      console.log(`[push:dev] user=${n.userId} title="${n.title}" body="${n.body ?? ''}"`)
    }
    return 0
  }

  const userIds = [...new Set(inputs.map((n) => n.userId))]
  const porUsuario = new Map<string, NotificacionInput[]>()
  for (const n of inputs) {
    const arr = porUsuario.get(n.userId) ?? []
    arr.push(n)
    porUsuario.set(n.userId, arr)
  }

  const { suscripciones } = await withTenant(clubId, async ({ tx }) => {
    const res = await tx.execute<SubscriptionRow>(sql`
      SELECT id, user_id, endpoint, keys_p256dh, keys_auth
      FROM push_subscriptions
      WHERE club_id = ${clubId}
        AND user_id IN (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})
    `)
    return { suscripciones: res.rows }
  })

  if (suscripciones.length === 0) return 0

  setupVapid()
  const expiradas: string[] = []
  let enviados = 0

  for (const sub of suscripciones) {
    const notifs = porUsuario.get(sub.user_id) ?? []
    for (const n of notifs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
          },
          JSON.stringify({
            type: n.type,
            title: n.title,
            body: n.body ?? '',
            data: n.data ?? null,
            clubId,
          }),
        )
        enviados += 1
      } catch (err) {
        // 404/410 = la suscripción ya no existe en el push service: se borra.
        const code = typeof err === 'object' && err && 'statusCode' in err
          ? Number((err as { statusCode?: unknown }).statusCode)
          : null
        if (code === 404 || code === 410) {
          expiradas.push(sub.id)
        } else {
          console.error(`[push] falló el envío a ${sub.endpoint}`, err)
        }
      }
    }
  }

  if (expiradas.length > 0) {
    try {
      await withTenant(clubId, async ({ tx }) => {
        await tx.execute(sql`DELETE FROM push_subscriptions WHERE club_id = ${clubId} AND id IN (${sql.join(expiradas.map((id) => sql`${id}`), sql`, `)})`)
      })
    } catch (err) {
      console.error('[push] no se pudieron limpiar suscripciones expiradas', err)
    }
  }

  return enviados
}
