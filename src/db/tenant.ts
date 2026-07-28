import { sql } from 'drizzle-orm'
import { db } from './client'

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Toda query de dominio pasa por acá. El `true` final de set_config hace
 * el setting LOCAL a la transacción: no se filtra a otro request del pool.
 */
export async function withTenant<T>(clubId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_club', ${clubId}, true)`)
    return fn(tx)
  })
}
