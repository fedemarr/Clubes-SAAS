'use server'

import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { withTenant } from '@/db/tenant'
import { accounts, memberships } from '@/db/schema'
import { requirePermission } from '@/lib/permissions'
import { crearPreferenciaPago } from '@/modules/cobranzas/mercadopago'
import { firmarUrlSubida, borrarObjeto } from '@/lib/storage/r2'
import { documentoIdSchema, subirDocumentoSchema } from '@/modules/documentos/schemas'
import { insertarDocumentoTx } from '@/modules/documentos/service'
import { personasDelMiembroTx } from './queries'

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

const linkSchema = z.object({
  accountId: z.string().uuid(),
  montoCents: z.number().int().positive('El monto tiene que ser mayor a cero'),
})

/**
 * Crea el link de Checkout Pro (Mercado Pago) para la cuenta del socio.
 * El socio no puede pagar la cuenta de otro: solo se deja armar la
 * preferencia si la cuenta pertenece al grupo familiar del usuario.
 */
export async function crearLinkPago(clubSlug: string, input: unknown): Promise<ActionResult<{ url: string }>> {
  const parsed = linkSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const ctx = await requirePermission('notificaciones.ver', { kind: 'club' }, clubSlug)
    const periodo = new Date().toISOString().slice(0, 7)

    const resultado = await withTenant(ctx.clubId, async ({ tx }) => {
      const personIds = await personasDelMiembroTx(tx, ctx.clubId, ctx.personId)
      const membresias = await tx
        .select({ accountId: memberships.accountId })
        .from(memberships)
        .where(and(eq(memberships.clubId, ctx.clubId), inArray(memberships.personId, personIds)))
      const holders = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(
          and(
            eq(accounts.clubId, ctx.clubId),
            inArray(accounts.holderPersonId, personIds),
            isNull(accounts.deletedAt),
          ),
        )
      const cuentasPropias = new Set([...membresias.map((m) => m.accountId), ...holders.map((h) => h.id)])

      if (!cuentasPropias.has(parsed.data.accountId)) {
        return { error: 'Esa cuenta no es tuya.' } as const
      }

      return crearPreferenciaPago(ctx.clubId, parsed.data.accountId, parsed.data.montoCents, periodo)
    })

    if ('error' in resultado) return { ok: false, error: resultado.error }
    return { ok: true, data: { url: resultado.url } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo generar el link de pago.' }
  }
}

// ---------------------------------------------------------------------------
// M7 · Subida de documentos del socio (grupo familiar)
// ---------------------------------------------------------------------------

/**
 * Arranca la subida de un documento del socio (propio o de un hijo a cargo).
 * Valida la propiedad ANTES de insertar (persona del grupo familiar) y que el
 * tipo esté habilitado en el club. Devuelve la URL firmada para que el
 * navegador suba el archivo directo a R2 (sin R2 la URL es null = dev).
 */
export async function iniciarSubidaDocumento(
  clubSlug: string,
  input: unknown,
): Promise<ActionResult<{ documentId: string; uploadUrl: string | null; fileName: string }>> {
  const parsed = subirDocumentoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const ctx = await requirePermission('notificaciones.ver', { kind: 'club' }, clubSlug)
    const resultado = await withTenant(
      ctx.clubId,
      async ({ tx }) => {
        const personIds = await personasDelMiembroTx(tx, ctx.clubId, ctx.personId)
        if (!personIds.includes(parsed.data.personId)) {
          throw new Error('Solo podés subir documentos de tu grupo familiar.')
        }
        return insertarDocumentoTx(tx, ctx.clubId, {
          personId: parsed.data.personId,
          kind: parsed.data.kind,
          fileName: parsed.data.fileName,
          mimeType: parsed.data.mimeType,
          fileSize: parsed.data.fileSize,
          uploadedByUserId: ctx.userId,
          issuedOn: parsed.data.issuedOn,
          expiresOn: parsed.data.expiresOn,
        })
      },
      { userId: ctx.userId },
    )

    const uploadUrl = await firmarUrlSubida(resultado.documento.fileKey, parsed.data.mimeType)
    return { ok: true, data: { documentId: resultado.documento.id, uploadUrl, fileName: parsed.data.fileName } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo iniciar la subida.' }
  }
}

/**
 * Borra un documento propio (pendiente o rechazado) del socio. Solo el dueño
 * del grupo familiar; el archivo en R2 se borra best-effort después del
 * commit. Los documentos vigentes/vencidos no se borran: quedan en el
 * historial del club.
 */
export async function borrarDocumento(clubSlug: string, input: unknown): Promise<ActionResult<null>> {
  const parsed = documentoIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const ctx = await requirePermission('notificaciones.ver', { kind: 'club' }, clubSlug)
    const fileKey = await withTenant(
      ctx.clubId,
      async ({ tx }) => {
        const personIds = await personasDelMiembroTx(tx, ctx.clubId, ctx.personId)
        const { rows } = await tx.execute<{ file_key: string }>(sql`
          UPDATE documents SET deleted_at = now()
          WHERE id = ${parsed.data.documentId} AND club_id = ${ctx.clubId}
            AND person_id IN (${sql.join(personIds.map((p) => sql`${p}`), sql`, `)})
            AND status IN ('pendiente', 'rechazado')
            AND deleted_at IS NULL
          RETURNING file_key
        `)
        const doc = rows[0]
        if (!doc) throw new Error('No podés borrar ese documento.')
        return doc.file_key
      },
      { userId: ctx.userId },
    )
    await borrarObjeto(fileKey)
    return { ok: true, data: null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo borrar el documento.' }
  }
}
