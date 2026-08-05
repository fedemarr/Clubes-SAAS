import { sql } from 'drizzle-orm'
import type { Tx } from '@/db/tenant'
import { generarFileKey } from '@/lib/storage/r2'
import type { TipoDocumento } from './queries'

/**
 * Lógica compartida de documentos (M7). Los call sites (portal y staff)
 * resuelven la propiedad sobre la persona ANTES de llamar a estos helpers:
 * acá solo se valida la configuración del tipo y se inserta el registro.
 */

export async function tipoDocumentoPorKindTx(tx: Tx, clubId: string, kind: string): Promise<TipoDocumento | null> {
  const { rows } = await tx.execute<{
    id: string
    kind: string
    label: string
    requires_expiry: boolean
    alert_days: number[]
    enabled: boolean
  }>(sql`
    SELECT id, kind, label, requires_expiry, alert_days, enabled
    FROM document_types
    WHERE club_id = ${clubId} AND kind = ${kind}
  `)
  const r = rows[0]
  if (!r) return null
  return {
    id: r.id,
    kind: r.kind,
    label: r.label,
    requiresExpiry: r.requires_expiry,
    alertDays: r.alert_days,
    enabled: r.enabled,
  }
}

export type IniciarSubidaInput = {
  personId: string
  kind: string
  fileName: string
  mimeType: string
  fileSize: number
  uploadedByUserId: string
  issuedOn?: string | null
  expiresOn?: string | null
}

export type DocumentoInsertado = {
  id: string
  fileKey: string
}

/**
 * Valida el tipo (existente y habilitado) y crea el registro del documento
 * con estado 'pendiente'. La URL firmada de subida se pide DESPUÉS del
 * commit por el call site, para no firmar un objeto que después puede no
 * existir. Devuelve la clave del archivo para que el caller la firme.
 */
export async function insertarDocumentoTx(
  tx: Tx,
  clubId: string,
  input: IniciarSubidaInput,
): Promise<{ documento: DocumentoInsertado; tipo: TipoDocumento }> {
  const tipo = await tipoDocumentoPorKindTx(tx, clubId, input.kind)
  if (!tipo || !tipo.enabled) {
    throw new Error('Ese tipo de documento no está habilitado en el club.')
  }
  if (tipo.requiresExpiry && !input.expiresOn) {
    throw new Error(`El ${tipo.label} requiere fecha de vencimiento.`)
  }

  const ext = input.fileName.split('.').pop() ?? 'bin'
  const fileKey = generarFileKey(clubId, ext)

  const { rows } = await tx.execute<{ id: string }>(sql`
    INSERT INTO documents (club_id, person_id, kind, file_key, file_name, mime_type, file_size,
                           issued_on, expires_on, status, uploaded_by)
    VALUES (${clubId}, ${input.personId}, ${input.kind}, ${fileKey}, ${input.fileName},
            ${input.mimeType}, ${input.fileSize}, ${input.issuedOn ?? null},
            ${input.expiresOn ?? null}, 'pendiente', ${input.uploadedByUserId})
    RETURNING id
  `)
  const row = rows[0]
  if (!row) throw new Error('No se pudo registrar el documento.')
  return { documento: { id: row.id, fileKey }, tipo }
}
