import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { withTenant } from '@/db/tenant'
import { auth } from '@/lib/auth/config'
import { rolesEnClub } from '@/lib/permissions'

/**
 * Registra la suscripción Web Push del navegador para el club. Upsert por
 * (club_id, endpoint): el mismo navegador no se duplica. La suscripción
 * queda asociada al usuario de la sesión — si cambia la persona, se
 * re-registra. Sin VAPID configurado acepta igual (el envío es no-op en
 * dev), para que el flujo de UI se pueda probar local.
 */
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url)
  const slug = searchParams.get('club')
  if (!slug) return NextResponse.json({ error: 'Falta el club' }, { status: 400 })

  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const ctx = await rolesEnClub(slug)
  if (!ctx) return NextResponse.json({ error: 'No sos parte de este club' }, { status: 404 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }
  const { endpoint, keys } = (body ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) {
    return NextResponse.json({ error: 'Endpoint inválido' }, { status: 400 })
  }
  const p256dh = keys?.p256dh
  const authKey = keys?.auth
  if (typeof p256dh !== 'string' || p256dh.length === 0 || typeof authKey !== 'string' || authKey.length === 0) {
    return NextResponse.json({ error: 'Claves de suscripción inválidas' }, { status: 400 })
  }

  await withTenant(
    ctx.clubId,
    async ({ tx }) => {
      await tx.execute(sql`
        INSERT INTO push_subscriptions (club_id, user_id, endpoint, keys_p256dh, keys_auth, user_agent)
        VALUES (${ctx.clubId}, ${ctx.userId}, ${endpoint}, ${p256dh}, ${authKey}, ${req.headers.get('user-agent')})
        ON CONFLICT (club_id, endpoint)
        DO UPDATE SET keys_p256dh = EXCLUDED.keys_p256dh,
                      keys_auth = EXCLUDED.keys_auth,
                      user_agent = EXCLUDED.user_agent,
                      last_seen_at = now()
      `)
    },
    { userId: ctx.userId },
  )

  return NextResponse.json({ ok: true })
}

export const dynamic = 'force-dynamic'
