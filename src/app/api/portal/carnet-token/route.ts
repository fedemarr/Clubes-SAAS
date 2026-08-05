import { NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { auth } from '@/lib/auth/config'
import { rolesEnClub } from '@/lib/permissions'

/**
 * Token del carnet digital (M6): el QR rota y cada token es un JWT firmado
 * de 5 minutos con clubId + personId. El secreto nunca sale del server.
 * Validez de membresía acotada a un instante: si la persona pierde el rol,
 * el token deja de ser válido en el próximo refresh y no se renueva.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const slug = searchParams.get('club')
  if (!slug) return NextResponse.json({ error: 'Falta el club' }, { status: 400 })

  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const ctx = await rolesEnClub(slug)
  if (!ctx) return NextResponse.json({ error: 'No sos parte de este club' }, { status: 404 })

  const secret =
    process.env.PORTAL_QR_SECRET ??
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Falta configurar PORTAL_QR_SECRET' }, { status: 500 })
  }

  const expiraEn = 5 * 60
  const token = await new SignJWT({ clubId: ctx.clubId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(ctx.personId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiraEn)
    .sign(new TextEncoder().encode(secret))

  return NextResponse.json({ token, expiraEn })
}

export const dynamic = 'force-dynamic'
