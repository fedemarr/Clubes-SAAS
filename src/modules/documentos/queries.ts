import { sql } from 'drizzle-orm'
import { withTenant, type Tx } from '@/db/tenant'
import { firmarUrlDescarga } from '@/lib/storage/r2'

export type TipoDocumento = {
  id: string
  kind: string
  label: string
  requiresExpiry: boolean
  alertDays: number[]
  enabled: boolean
}

export type DocumentoItem = {
  id: string
  personId: string
  personNombre: string
  kind: string
  tipoLabel: string | null
  fileName: string | null
  fileKey: string
  issuedOn: string | null
  expiresOn: string | null
  status: string
  reviewerEmail: string | null
  rejectionReason: string | null
  createdAt: Date
  downloadUrl: string | null
}

const DOCUMENTO_COLUMNS = sql`
  d.id, d.person_id, d.kind, d.file_key, d.file_name, d.issued_on, d.expires_on,
  d.status, d.rejection_reason, d.created_at,
  p.first_name || ' ' || p.last_name AS person_nombre,
  dt.label AS tipo_label,
  r.email AS reviewer_email
`

export async function listarTiposDocumento(clubId: string): Promise<TipoDocumento[]> {
  return withTenant(clubId, async ({ tx }) => {
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
      WHERE club_id = ${clubId}
      ORDER BY enabled DESC, label ASC
    `)
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      label: r.label,
      requiresExpiry: r.requires_expiry,
      alertDays: r.alert_days,
      enabled: r.enabled,
    }))
  })
}

export async function tiposHabilitados(clubId: string): Promise<TipoDocumento[]> {
  return withTenant(clubId, async ({ tx }) => {
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
      WHERE club_id = ${clubId} AND enabled = true
      ORDER BY label ASC
    `)
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      label: r.label,
      requiresExpiry: r.requires_expiry,
      alertDays: r.alert_days,
      enabled: r.enabled,
    }))
  })
}

type DocumentoRow = {
  id: string
  person_id: string
  kind: string
  file_key: string
  file_name: string | null
  issued_on: string | null
  expires_on: string | null
  status: string
  rejection_reason: string | null
  created_at: Date
  person_nombre: string
  tipo_label: string | null
  reviewer_email: string | null
}

/**
 * Documentos con nombre de persona, etiqueta del tipo y revisor. Filtra por
 * persona(s) y/o estado. Firma la URL de descarga para cada uno (5 min) —
 * la firma es local, no va a la red, así que es segura llamarla en la query.
 * La variante `Tx` la usan las queries del portal dentro del mismo withTenant
 * (el patrón no anida withTenant).
 */
export async function listarDocumentosTx(
  tx: Tx,
  clubId: string,
  opts?: { personIds?: string[]; status?: string },
): Promise<DocumentoItem[]> {
  const condiciones = [sql`d.club_id = ${clubId}`, sql`d.deleted_at IS NULL`]
  if (opts?.personIds && opts.personIds.length > 0) {
    condiciones.push(sql`d.person_id IN (${sql.join(opts.personIds.map((p) => sql`${p}`), sql`, `)})`)
  }
  if (opts?.status) condiciones.push(sql`d.status = ${opts.status}`)

  const { rows } = await tx.execute<DocumentoRow>(sql`
    SELECT ${DOCUMENTO_COLUMNS}
    FROM documents d
    JOIN persons p ON p.id = d.person_id
    LEFT JOIN document_types dt ON dt.club_id = d.club_id AND dt.kind = d.kind::text
    LEFT JOIN users r ON r.id = d.reviewed_by
    WHERE ${sql.join(condiciones, sql` AND `)}
    ORDER BY d.created_at DESC
    LIMIT 200
  `)

  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      personId: r.person_id,
      personNombre: r.person_nombre,
      kind: r.kind,
      tipoLabel: r.tipo_label,
      fileName: r.file_name,
      fileKey: r.file_key,
      issuedOn: r.issued_on,
      expiresOn: r.expires_on,
      status: r.status,
      reviewerEmail: r.reviewer_email,
      rejectionReason: r.rejection_reason,
      createdAt: r.created_at,
      downloadUrl: await firmarUrlDescarga(r.file_key),
    })),
  )
}

export function listarDocumentos(
  clubId: string,
  opts?: { personIds?: string[]; status?: string },
): Promise<DocumentoItem[]> {
  return withTenant(clubId, async ({ tx }) => listarDocumentosTx(tx, clubId, opts))
}

export async function resumenDocumentos(
  clubId: string,
): Promise<{ pendientes: number; vigentes: number; vencidos: number; rechazados: number }> {
  return withTenant(clubId, async ({ tx }) => {
    const { rows } = await tx.execute<{ status: string; total: string }>(sql`
      SELECT status, COUNT(*)::text AS total
      FROM documents
      WHERE club_id = ${clubId} AND deleted_at IS NULL
      GROUP BY status
    `)
    const porEstado = new Map(rows.map((r) => [r.status, Number(r.total)]))
    return {
      pendientes: porEstado.get('pendiente') ?? 0,
      vigentes: porEstado.get('vigente') ?? 0,
      vencidos: porEstado.get('vencido') ?? 0,
      rechazados: porEstado.get('rechazado') ?? 0,
    }
  })
}
