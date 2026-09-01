/**
 * Sport packs (M13): configuración por deporte dentro de clubs.sport_pack
 * (JSONB). El SA los edita desde /super-admin/clubs/[slug] · tab Sport packs.
 * Las divisiones/categorías reales viven en `teams` (se muestran en la misma
 * tab como dato derivado); acá solo se configuran posiciones y tipos de
 * partido sugeridos para cada deporte.
 */

export type SportPackEntry = {
  key: string
  label: string
  posiciones: string[]
  tiposPartido: string[]
}

function lista(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map((s) => String(s).trim()).filter(Boolean).slice(0, 30)
}

/** Normaliza el JSONB clubs.sport_pack a entradas editables (SA). */
export function normalizarSportPacks(raw: unknown): SportPackEntry[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
  return Object.entries(raw as Record<string, unknown>).map(([key, value]) => {
    const v = (value ?? {}) as Record<string, unknown>
    return {
      key,
      label: String(v.label ?? key),
      posiciones: lista(v.posiciones),
      tiposPartido: lista(v.tiposPartido),
    }
  })
}