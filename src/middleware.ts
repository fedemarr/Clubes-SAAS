import { and, eq, gte, isNull, or } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { clubs, personRoles, persons } from '@/db/schema'
import { withTenant } from '@/db/tenant'
import { auth } from '@/lib/auth/config'

const RESERVED_FIRST_SEGMENT = new Set(['api', 'login', 'registro', 'recuperar', 'favicon.ico'])

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
  if (userId) {
    // persons/person_roles tienen RLS forzado: la query tiene que ir dentro
    // de withTenant() (set_config), si no siempre devuelve cero filas.
    const activePerson = await withTenant(club.id, async (tx) => {
      const today = new Date().toISOString().slice(0, 10)
      const [row] = await tx
        .select({ id: persons.id })
        .from(persons)
        .innerJoin(personRoles, eq(personRoles.personId, persons.id))
        .where(
          and(
            eq(persons.clubId, club.id),
            eq(persons.userId, userId),
            isNull(persons.deletedAt),
            or(isNull(personRoles.validTo), gte(personRoles.validTo, today)),
          ),
        )
        .limit(1)
      return row
    })

    if (!activePerson) {
      return new NextResponse(null, { status: 404 })
    }
  }

  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-club-id', club.id)
  requestHeaders.set('x-club-slug', club.slug)
  return NextResponse.next({ request: { headers: requestHeaders } })
})

export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!api|_next|favicon.ico|login|registro|recuperar).*)'],
}
