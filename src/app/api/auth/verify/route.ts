import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { users } from '@/db/schema'
import { verifyEmailToken } from '@/lib/auth/tokens'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.redirect(new URL('/login?error=token_faltante', req.url))
  }

  try {
    const payload = await verifyEmailToken(token, 'verify-email')
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, payload.userId))
    return NextResponse.redirect(new URL('/login?verificado=1', req.url))
  } catch {
    return NextResponse.redirect(new URL('/login?error=token_invalido', req.url))
  }
}
