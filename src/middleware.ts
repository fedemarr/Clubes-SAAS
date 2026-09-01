import { and, eq, gte, isNull, or, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { clubs, personRoles, persons } from '@/db/schema'
import { withTenant } from '@/db/tenant'
import { auth } from '@/lib/auth/config'
import { leerCookieImpersonacionCookieString, COOKIE_IMPRESION } from '@/lib/impersonacion'

const RESERVED_FIRST_SEGMENT = new Set([
  'api',
  'login',
  'registro',
  'recuperar',
  'favicon.ico',
  'icon.svg',
  'sw.js',
  'manifest.webmanifest',
  'icons',
  'offline',
  'super-admin',
  'crests',
])

/**
 * Resuelve el club por el segmento [club] de la URL y, si hay sesión,
 * valida que la persona tenga un person_role vigente en ese club.
 * Siempre 404 ante club inexistente o persona sin rol vigente: nunca 403,
 * para no revelarle a un tenant ajeno que el club existe.
 */
export default auth(async function middleware(req) {
  const segments = req.nextUrl.pathname.split('/').filter(Boolean)
  const slug = segments[0]

  if (!slug || RESERVED_FIRST_SEGMENT.has(slug)) {
    return NextResponse.next()
  }

  const [club] = await db
    .select()
    .from(clubs)
    .where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)))
    .limit(1)

  if (!club) {
    return new NextResponse(null, { status: 404 })
  }

  const userId = req.auth?.user?.id
  // Impersonación (M14): si hay una cookie firmada válida, la identidad
  // efectiva es la persona impersonada (y su user_id), no la sesión real.
  const impCookie = req.cookies.get(COOKIE_IMPRESION)?.value
  const imp = impCookie ? leerCookieImpersonacionCookieString(impCookie) : null

  if (userId || imp) {
    // El super admin (M9) no tiene persona en el club donde opera como
    // staff (M10) — saltea la validación de rol vigente. Mientras
    // impersona (M14), en cambio, DEBE validar a la persona impersonada.
    let esSuperAdmin = false
    if (!imp) {
      const email = req.auth?.user?.email
      if (email) {
        const saRows = await db.execute<{ id: string }>(sql`
          SELECT id FROM super_admin_users WHERE email = ${email}
        `)
        esSuperAdmin = saRows.rows.length > 0
      }
    }

    if (!esSuperAdmin) {
      // persons/person_roles tienen RLS forzado: la query tiene que ir dentro
      // de withTenant() (set_config), si no siempre devuelve cero filas.
      const activePerson = await withTenant(club.id, async ({ tx }) => {
        const today = new Date().toISOString().slice(0, 10)
        const base = and(
          eq(persons.clubId, club.id),
          isNull(persons.deletedAt),
          or(isNull(personRoles.validTo), gte(personRoles.validTo, today)),
        )
        const [row] = imp
          ? await tx.select({ id: persons.id }).from(persons).innerJoin(personRoles, eq(personRoles.personId, persons.id)).where(and(base, eq(persons.id, imp.personaId))).limit(1)
          : await tx.select({ id: persons.id }).from(persons).innerJoin(personRoles, eq(personRoles.personId, persons.id)).where(and(base, eq(persons.userId, userId!))).limit(1)
        return row
      })

      if (!activePerson) {
        return new NextResponse(null, { status: 404 })
      }
    }
  }

  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-club-id', club.id)
  requestHeaders.set('x-club-slug', club.slug)
  return NextResponse.next({ request: { headers: requestHeaders } })
})

export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!api|_next|favicon.ico|icon.svg|sw.js|manifest.webmanifest|icons|login|registro|recuperar).*)'],
}
