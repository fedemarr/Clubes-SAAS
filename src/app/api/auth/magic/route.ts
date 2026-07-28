import { NextRequest, NextResponse } from 'next/server'
import { signIn } from '@/lib/auth/config'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.redirect(new URL('/login?error=token_faltante', req.url))
  }

  try {
    await signIn('magic-link', { token, redirect: false })
  } catch {
    return NextResponse.redirect(new URL('/login?error=token_invalido', req.url))
  }

  return NextResponse.redirect(new URL('/', req.url))
}
