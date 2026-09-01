import { sql } from 'drizzle-orm'
import { withTenant, type Tx } from '@/db/tenant'

/**
 * Beneficios del portal (M12). Tabla `club_benefits` vive en rls.sql
 * (sección 16, patrón M5): se lee con SQL crudo sobre `tx` porque no hay
 * builder tipado de Drizzle para tablas que no están en schema.ts.
 */

export type Beneficio = {
  id: string
  title: string
  description: string | null
  icon: string | null
  sort: number
  active: boolean
}

export async function listarBeneficiosTx(tx: Tx, clubId: string, soloActivos = true): Promise<Beneficio[]> {
  const { rows } = await tx.execute<Beneficio>(sql`
    SELECT id, title, description, icon, sort, active
    FROM club_benefits
    WHERE club_id = ${clubId}
      ${soloActivos ? sql`AND active = true` : sql``}
    ORDER BY sort ASC, created_at ASC
  `)
  return rows
}

export async function listarBeneficios(clubId: string, soloActivos = true): Promise<Beneficio[]> {
  return withTenant(clubId, async ({ tx }) => listarBeneficiosTx(tx, clubId, soloActivos))
}