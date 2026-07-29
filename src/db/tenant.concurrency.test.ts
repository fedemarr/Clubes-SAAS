import { and, eq, isNull } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from './client'
import { clubs, teams } from './schema'
import { withTenant } from './tenant'

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function getClubId(slug: string): Promise<string> {
  const [club] = await db
    .select()
    .from(clubs)
    .where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)))
    .limit(1)
  if (!club) {
    throw new Error(`Club de prueba "${slug}" no encontrado — corré "npm run db:seed" primero`)
  }
  return club.id
}

/**
 * El riesgo real no es que withTenant() "olvide" el set_config: es que dos
 * requests concurrentes, corriendo sobre el mismo Pool, terminen
 * pisándose si el set_config y la query no comparten la misma conexión
 * física. Por eso cada lectura tiene un delay artificial entre el
 * set_config y el select: fuerza a que las dos transacciones se solapen
 * en el tiempo mientras comparten el Pool, que es exactamente el
 * escenario en el que el aislamiento se rompe si withTenant no usara una
 * transacción real.
 */
describe('withTenant — aislamiento bajo concurrencia real', () => {
  it('dos clubes distintos, leídos en paralelo repetidas veces, nunca cruzan datos', async () => {
    const [losCedrosId, demoFcId] = await Promise.all([getClubId('los-cedros'), getClubId('demo-fc')])

    async function readTeamClubIds(clubId: string, delayMs: number) {
      return withTenant(clubId, async ({ tx }) => {
        await delay(delayMs)
        const rows = await tx.select({ clubId: teams.clubId }).from(teams)
        return rows.map((r: { clubId: string }) => r.clubId)
      })
    }

    const ITERATIONS = 5
    for (let i = 0; i < ITERATIONS; i++) {
      const [losCedrosRows, demoFcRows] = await Promise.all([
        readTeamClubIds(losCedrosId, 60),
        readTeamClubIds(demoFcId, 10),
      ])

      expect(losCedrosRows.length).toBeGreaterThan(0)
      expect(demoFcRows.length).toBeGreaterThan(0)

      expect(losCedrosRows.every((id) => id === losCedrosId)).toBe(true)
      expect(demoFcRows.every((id) => id === demoFcId)).toBe(true)
    }
  })

  it('sin withTenant (sin set_config) no se ve ninguna fila — RLS activo de verdad', async () => {
    const rows = await db.select({ clubId: teams.clubId }).from(teams)
    expect(rows).toHaveLength(0)
  })
})
