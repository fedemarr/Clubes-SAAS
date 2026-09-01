'use server'

import { randomUUID } from 'crypto'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { withTenant } from '@/db/tenant'
import { requirePermission } from '@/lib/permissions'
import { esSuperAdmin } from '@/lib/super-admin'
import { guardarMapeoSchema, importarInputSchema } from './schemas'
import { cargarDedupeSets, insertarFilas, validarMasDedupe, type FilaCruda } from './service'

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

type ActorImportador = { clubId: string; userId: string }

/**
 * Acceso al importador: presidente del club (permiso importador.usar) o
 * super admin actuando como staff sobre cualquier tenant (M10).
 */
async function actorImportador(clubSlug: string): Promise<ActorImportador | null> {
  try {
    const ctx = await requirePermission('importador.usar', { kind: 'club' }, clubSlug)
    return { clubId: ctx.clubId, userId: ctx.userId }
  } catch {
    const sa = await esSuperAdmin()
    if (!sa) return null
    const [club] = await db
      .select()
      .from(clubs)
      .where(and(eq(clubs.slug, clubSlug), isNull(clubs.deletedAt)))
      .limit(1)
    if (!club) return null
    return { clubId: club.id, userId: sa.userId }
  }
}

export type FilaValidacion = {
  index: number
  estado: 'ok' | 'error' | 'duplicada'
  errores: string[]
}

export type ValidacionResultado = {
  total: number
  ok: number
  duplicadas: number
  conErrores: number
  rows: FilaValidacion[]
}

function resumenValidacion(rows: { estado: 'ok' | 'error' | 'duplicada' }[]): Omit<ValidacionResultado, 'rows'> {
  return {
    total: rows.length,
    ok: rows.filter((r) => r.estado === 'ok').length,
    duplicadas: rows.filter((r) => r.estado === 'duplicada').length,
    conErrores: rows.filter((r) => r.estado === 'error').length,
  }
}

/**
 * Paso "Validación" del wizard: corre las reglas por fila (tipos, campos
 * requeridos, duplicados dentro del archivo y contra la base) y devuelve el
 * resultado completo para mostrar la vista previa. No escribe nada.
 */
export async function validarImportacion(clubSlug: string, input: unknown): Promise<ActionResult<ValidacionResultado>> {
  const parsed = importarInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const actor = await actorImportador(clubSlug)
  if (!actor) return { ok: false, error: 'No tenés permiso para usar el importador.' }

  const filas: FilaCruda[] = parsed.data.rows.map((data, index) => ({ index, data }))
  const resultado = await withTenant(actor.clubId, async ({ tx }) => {
    const sets = await cargarDedupeSets(tx, actor.clubId, parsed.data.tipo)
    return validarMasDedupe(parsed.data.tipo, filas, sets)
  })

  return {
    ok: true,
    data: {
      ...resumenValidacion(resultado),
      rows: resultado.map((r) => ({ index: r.index, estado: r.estado, errores: r.errores })),
    },
  }
}

export type ImportacionResultado = {
  batchId: string
  total: number
  importados: number
  omitidos: number
  duplicadas: number
  conErrores: number
}

/**
 * Paso "Confirmar": re-valida con sets frescos dentro de la transacción e
 * inserta el lote. Cada corrida genera un batch_id que agrupa la auditoría
 * (withTenant 4º arg) y deja su fila en import_batches.
 */
export async function importarImportacion(clubSlug: string, input: unknown): Promise<ActionResult<ImportacionResultado>> {
  const parsed = importarInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const actor = await actorImportador(clubSlug)
  if (!actor) return { ok: false, error: 'No tenés permiso para usar el importador.' }

  const { tipo, fileName, rows: filasCrudas } = parsed.data
  const filas: FilaCruda[] = filasCrudas.map((data, index) => ({ index, data }))
  const batchId = randomUUID()

  const { validado, importados, totalOk } = await withTenant(
    actor.clubId,
    async ({ tx, audit }) => {
      const sets = await cargarDedupeSets(tx, actor.clubId, tipo)
      const validado = validarMasDedupe(tipo, filas, sets)
      const { importados, totalOk } = await insertarFilas(tx, actor.clubId, tipo, validado)
      const duplicadas = validado.filter((f) => f.estado === 'duplicada').length
      const conErrores = validado.filter((f) => f.estado === 'error').length

      await tx.execute(sql`
        INSERT INTO import_batches (id, club_id, import_type, file_name, total_rows, imported_rows, skipped_rows, error_rows, mapping, imported_by)
        VALUES (${batchId}, ${actor.clubId}, ${tipo}, ${fileName}, ${filas.length}, ${importados},
                ${duplicadas}, ${conErrores}, ${JSON.stringify({ rows: filas.length })}::jsonb, ${actor.userId})
      `)
      await audit('import_batches', batchId, 'custom', {
        tipo,
        file: fileName,
        total: filas.length,
        importados,
        omitidos: totalOk - importados,
        duplicadas,
        conErrores,
      })
      return { validado, importados, totalOk }
    },
    { userId: actor.userId },
    batchId,
  )

  return {
    ok: true,
    data: {
      batchId,
      total: filas.length,
      importados,
      omitidos: totalOk - importados,
      duplicadas: validado.filter((f) => f.estado === 'duplicada').length,
      conErrores: validado.filter((f) => f.estado === 'error').length,
    },
  }
}

/**
 * Memoriza el mapeo de columnas elegido por el club para un tipo, para que la
 * próxima importación arranque pre-mapeada. Best-effort: si falla, el wizard
 * sigue con el mapeo actual.
 */
export async function guardarMapeo(clubSlug: string, input: unknown): Promise<ActionResult<null>> {
  const parsed = guardarMapeoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const actor = await actorImportador(clubSlug)
  if (!actor) return { ok: false, error: 'No tenés permiso para usar el importador.' }

  try {
    await withTenant(
      actor.clubId,
      async ({ tx }) => {
        await tx.execute(sql`
          INSERT INTO import_mappings (club_id, import_type, mapping, has_header, updated_by, updated_at)
          VALUES (${actor.clubId}, ${parsed.data.tipo}, ${JSON.stringify(parsed.data.mapping)}::jsonb,
                  ${parsed.data.hasHeader}, ${actor.userId}, now())
          ON CONFLICT (club_id, import_type) DO UPDATE
          SET mapping = EXCLUDED.mapping, has_header = EXCLUDED.has_header,
              updated_by = EXCLUDED.updated_by, updated_at = now()
        `)
      },
      { userId: actor.userId },
    )
    return { ok: true, data: null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo guardar el mapeo.' }
  }
}