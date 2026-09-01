'use server'

import { sql } from 'drizzle-orm'
import { withTenant } from '@/db/tenant'
import { requirePermission } from '@/lib/permissions'
import { emitirNotificaciones } from '@/lib/notifications/emit'
import { firmarUrlSubida } from '@/lib/storage/r2'
import {
  documentoIdSchema,
  guardarTipoDocumentoSchema,
  revisarDocumentoSchema,
  subirDocumentoSchema,
} from './schemas'
import { insertarDocumentoTx } from './service'

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

// ---------------------------------------------------------------------------
// M7 · Configuración de tipos de documento
// ---------------------------------------------------------------------------

export async function guardarTipoDocumento(clubSlug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = guardarTipoDocumentoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const ctx = await requirePermission('documentos.tipos', { kind: 'club' }, clubSlug)
    const id = await withTenant(
      ctx.clubId,
      async ({ tx, audit }) => {
        const { rows } = await tx.execute<{ id: string }>(sql`
          INSERT INTO document_types (club_id, kind, label, requires_expiry, alert_days, enabled, updated_by)
          VALUES (${ctx.clubId}, ${parsed.data.kind}, ${parsed.data.label},
                  ${parsed.data.requiresExpiry}, ${`{${parsed.data.alertDays.join(',')}}`}::int[],
                  ${parsed.data.enabled}, ${ctx.userId})
          ON CONFLICT (club_id, kind) DO UPDATE
          SET label = EXCLUDED.label, requires_expiry = EXCLUDED.requires_expiry,
              alert_days = EXCLUDED.alert_days, enabled = EXCLUDED.enabled,
              updated_by = EXCLUDED.updated_by, updated_at = now()
          RETURNING id
        `)
        const tipo = rows[0]
        if (!tipo) throw new Error('No se pudo guardar el tipo.')
        await audit('document_types', tipo.id, parsed.data.id ? 'update' : 'create', {
          kind: parsed.data.kind,
          label: parsed.data.label,
          requiresExpiry: parsed.data.requiresExpiry,
          alertDays: parsed.data.alertDays,
          enabled: parsed.data.enabled,
        })
        return tipo.id
      },
      { userId: ctx.userId },
    )
    return { ok: true, data: { id } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}

// ---------------------------------------------------------------------------
// M7 · Revisión (aprobar / rechazar)
// ---------------------------------------------------------------------------

/**
 * Aprueba (→ vigente) o rechaza (→ rechazado + motivo) un documento
 * pendiente. Al aprobar se resetean las alertas ya enviadas, para que el
 * ciclo de vencimiento arranque limpio. El dueño recibe una notificación.
 */
export async function revisarDocumento(clubSlug: string, input: unknown): Promise<ActionResult<null>> {
  const parsed = revisarDocumentoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  if (parsed.data.aprobar === false && !parsed.data.rejectionReason) {
    return { ok: false, error: 'El motivo del rechazo es obligatorio.' }
  }

  try {
    const ctx = await requirePermission('documentos.gestionar', { kind: 'club' }, clubSlug)
    await withTenant(
      ctx.clubId,
      async ({ tx, audit, onCommit }) => {
        const { rows } = await tx.execute<{
          id: string
          kind: string
          tipo_label: string
          owner_user_id: string | null
          expires_on: string | null
        }>(sql`
          SELECT d.id, d.kind, dt.label AS tipo_label, p.user_id AS owner_user_id, d.expires_on
          FROM documents d
          JOIN persons p ON p.id = d.person_id
          LEFT JOIN document_types dt ON dt.club_id = d.club_id AND dt.kind = d.kind::text
          WHERE d.id = ${parsed.data.documentId} AND d.club_id = ${ctx.clubId} AND d.deleted_at IS NULL
        `)
        const doc = rows[0]
        if (!doc) throw new Error('No existe ese documento.')

        const { rows: actualizados } = await tx.execute<{ id: string }>(sql`
          UPDATE documents
          SET status = ${parsed.data.aprobar ? 'vigente' : 'rechazado'},
              reviewed_by = ${ctx.userId},
              reviewed_at = now(),
              rejection_reason = ${parsed.data.aprobar ? null : parsed.data.rejectionReason ?? null},
              alerted_days = ${parsed.data.aprobar ? sql`'{}'::int[]` : sql`alerted_days`}
          WHERE id = ${parsed.data.documentId} AND club_id = ${ctx.clubId}
          RETURNING id
        `)
        if (!actualizados[0]) throw new Error('No se pudo actualizar el documento.')
        await audit('documents', doc.id, 'custom', {
          action: parsed.data.aprobar ? 'documento.aprobado' : 'documento.rechazado',
          rejectionReason: parsed.data.aprobar ? null : parsed.data.rejectionReason ?? null,
        })

        if (doc.owner_user_id) {
          await emitirNotificaciones({ tx, onCommit }, ctx.clubId, [
            {
              userId: doc.owner_user_id,
              type: parsed.data.aprobar ? 'documento.aprobado' : 'documento.rechazado',
              title: parsed.data.aprobar ? 'Documento aprobado' : 'Documento rechazado',
              body: parsed.data.aprobar
                ? `Tu ${doc.tipo_label ?? doc.kind} fue aprobado${doc.expires_on ? ` y vence el ${doc.expires_on}` : ''}.`
                : `Tu ${doc.tipo_label ?? doc.kind} fue rechazado: ${parsed.data.rejectionReason ?? ''}. Subilo de nuevo cuando puedas.`,
              data: { documentId: doc.id, kind: doc.kind },
            },
          ])
        }
      },
      { userId: ctx.userId },
    )
    return { ok: true, data: null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}

// ---------------------------------------------------------------------------
// M15 · Recordatorio al dueño (re-notificación desde el backoffice)
// ---------------------------------------------------------------------------

/**
 * Re-envía la notificación de un documento pendiente/vencido al dueño.
 * No cambia nada del documento: solo vuelve a avisar (útil cuando el socio
 * no reaccionó la primera vez). La notificación usa el canal normal.
 */
export async function recordarDocumento(clubSlug: string, input: unknown): Promise<ActionResult<null>> {
  const parsed = documentoIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const ctx = await requirePermission('documentos.gestionar', { kind: 'club' }, clubSlug)
    await withTenant(
      ctx.clubId,
      async ({ tx, audit, onCommit }) => {
        const { rows } = await tx.execute<{
          id: string
          kind: string
          tipo_label: string | null
          owner_user_id: string | null
          status: string
          expires_on: string | null
        }>(sql`
          SELECT d.id, d.kind, dt.label AS tipo_label, p.user_id AS owner_user_id, d.status, d.expires_on
          FROM documents d
          JOIN persons p ON p.id = d.person_id
          LEFT JOIN document_types dt ON dt.club_id = d.club_id AND dt.kind = d.kind::text
          WHERE d.id = ${parsed.data.documentId} AND d.club_id = ${ctx.clubId} AND d.deleted_at IS NULL
        `)
        const doc = rows[0]
        if (!doc) throw new Error('No existe ese documento.')
        if (!doc.owner_user_id) throw new Error('Ese documento no tiene un usuario dueño asignado.')

        const body =
          doc.status === 'vencido'
            ? `Tu ${doc.tipo_label ?? doc.kind} está vencido${doc.expires_on ? ` desde el ${doc.expires_on}` : ''}. Es importante que lo actualices.`
            : doc.status === 'pendiente'
              ? `Recordatorio: tu ${doc.tipo_label ?? doc.kind} sigue pendiente de revisión${doc.expires_on ? ` (vence el ${doc.expires_on})` : ''}.`
              : `Recordatorio de tu ${doc.tipo_label ?? doc.kind}. Revisá su vigencia.`

        await emitirNotificaciones({ tx, onCommit }, ctx.clubId, [
          {
            userId: doc.owner_user_id,
            type: 'documento.recordatorio',
            title: 'Recordatorio de documento',
            body,
            data: { documentId: doc.id, kind: doc.kind },
          },
        ])
        await audit('documents', doc.id, 'custom', { action: 'documento.recordatorioEnviado' })
      },
      { userId: ctx.userId },
    )
    return { ok: true, data: null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}

// ---------------------------------------------------------------------------
// M7 · Subida desde el backoffice (para una persona del club)
// ---------------------------------------------------------------------------

export async function subirDocumentoStaff(
  clubSlug: string,
  input: unknown,
): Promise<ActionResult<{ documentId: string; uploadUrl: string | null; fileName: string }>> {
  const parsed = subirDocumentoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const ctx = await requirePermission('documentos.gestionar', { kind: 'club' }, clubSlug)
    const resultado = await withTenant(ctx.clubId, async ({ tx }) => {
      const { rows: personas } = await tx.execute<{ id: string }>(sql`
        SELECT id FROM persons
        WHERE club_id = ${ctx.clubId} AND id = ${parsed.data.personId} AND deleted_at IS NULL
      `)
      if (personas.length === 0) throw new Error('Esa persona no existe en el club.')

      const { documento, tipo } = await insertarDocumentoTx(tx, ctx.clubId, {
        personId: parsed.data.personId,
        kind: parsed.data.kind,
        fileName: parsed.data.fileName,
        mimeType: parsed.data.mimeType,
        fileSize: parsed.data.fileSize,
        uploadedByUserId: ctx.userId,
        issuedOn: parsed.data.issuedOn,
        expiresOn: parsed.data.expiresOn,
      })
      return { documento, tipo }
    }, { userId: ctx.userId })

    const uploadUrl = await firmarUrlSubida(resultado.documento.fileKey, parsed.data.mimeType)
    return {
      ok: true,
      data: { documentId: resultado.documento.id, uploadUrl, fileName: parsed.data.fileName },
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}

// ---------------------------------------------------------------------------
// M7 · Cancelar una subida que no llegó a completarse (staff)
// ---------------------------------------------------------------------------

export async function cancelarSubidaStaff(clubSlug: string, input: unknown): Promise<ActionResult<null>> {
  const parsed = documentoIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const ctx = await requirePermission('documentos.gestionar', { kind: 'club' }, clubSlug)
    await withTenant(ctx.clubId, async ({ tx }) => {
      await tx.execute(sql`
        UPDATE documents SET deleted_at = now()
        WHERE id = ${parsed.data.documentId} AND club_id = ${ctx.clubId} AND status = 'pendiente'
      `)
    }, { userId: ctx.userId })
    return { ok: true, data: null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No tenés permiso para esto.' }
  }
}
