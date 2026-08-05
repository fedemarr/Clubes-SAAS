import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { withTenant } from '@/db/tenant'
import { auth } from '@/lib/auth/config'
import { rolesEnClub } from '@/lib/permissions'

/**
 * Da de baja la suscripción del navegador (cierre de sesión o toggle). El
 * DELETE va acotado por user_id: el socio solo borra sus propias
 * suscripciones aunque adivine un endpoint ajeno.
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
  const endpoint = typeof (body as { endpoint?: unknown })?.endpoint === 'string'
    ? (body as { endpoint: string }).endpoint
    : ''
  if (!endpoint) return NextResponse.json({ error: 'Endpoint inválido' }, { status: 400 })

  await withTenant(
    ctx.clubId,
    async ({ tx }) => {
      await tx.execute(sql`
        DELETE FROM push_subscriptions
        WHERE club_id = ${ctx.clubId} AND user_id = ${ctx.userId} AND endpoint = ${endpoint}
      `)
    },
    { userId: ctx.userId },
  )

  return NextResponse.json({ ok: true })
}

export const dynamic = 'force-dynamic'
