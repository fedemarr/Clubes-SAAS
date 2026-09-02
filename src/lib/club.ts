import { cache } from 'react'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'

/**
 * Lookup de club por slug, cacheado por request (React cache()). El layout
 * de [club] y cada página hija hacían este mismo select por separado —
 * misma query, un round trip a Neon de más en CADA navegación del portal.
 * cache() de React deduplica llamadas con los mismos argumentos dentro de
 * un mismo render de servidor (no entre requests distintos), así que el
 * layout la pide una vez y la página la vuelve a "pedir" gratis.
 */
export const obtenerClubPorSlug = cache(async (slug: string) => {
  const [club] = await db
    .select()
    .from(clubs)
    .where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)))
    .limit(1)
  return club ?? null
})
