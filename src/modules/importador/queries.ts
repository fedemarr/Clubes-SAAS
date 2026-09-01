import { sql } from 'drizzle-orm'
import { withTenant } from '@/db/tenant'
import type { MapeoImportacion, TipoImportacion } from './schemas'

export type MapeoGuardado = {
  mapping: MapeoImportacion
  hasHeader: boolean
}

/** Mapeos memorizados por club+tipo, para que el wizard arranque pre-mapeado. */
export async function obtenerMapeos(clubId: string): Promise<Partial<Record<TipoImportacion, MapeoGuardado>>> {
  return withTenant(clubId, async ({ tx }) => {
    const { rows } = await tx.execute<{
      import_type: string
      mapping: Record<string, number | null> | null
      has_header: boolean
    }>(sql`
      SELECT import_type, mapping, has_header FROM import_mappings WHERE club_id = ${clubId}
    `)
    const out: Partial<Record<TipoImportacion, MapeoGuardado>> = {}
    for (const r of rows) {
      if (r.import_type === 'personas' || r.import_type === 'categorias') {
        out[r.import_type] = { mapping: r.mapping ?? {}, hasHeader: r.has_header }
      }
    }
    return out
  })
}

export type BatchHistoria = {
  id: string
  import_type: TipoImportacion
  file_name: string
  total_rows: number
  imported_rows: number
  skipped_rows: number
  error_rows: number
  created_at: Date
}

/** Historial de corridas de importación del club (últimas 50). */
export async function listarBatches(clubId: string): Promise<BatchHistoria[]> {
  return withTenant(clubId, async ({ tx }) => {
    const { rows } = await tx.execute<{
      id: string
      import_type: string
      file_name: string
      total_rows: number
      imported_rows: number
      skipped_rows: number
      error_rows: number
      created_at: Date
    }>(sql`
      SELECT id, import_type, file_name, total_rows, imported_rows, skipped_rows, error_rows, created_at
      FROM import_batches
      WHERE club_id = ${clubId}
      ORDER BY created_at DESC
      LIMIT 50
    `)
    return rows as BatchHistoria[]
  })
}