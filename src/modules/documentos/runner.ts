import { sql } from 'drizzle-orm'
import { withTenant } from '@/db/tenant'
import { emitirNotificaciones } from '@/lib/notifications/emit'

export type ResultadoAlertasDocumentos = {
  vencidos: number
  alertas: number
}

/**
 * Motor de alertas de vencimiento de documentos (M7). Corre a diario desde
 * el cron (y se puede disparar a mano). Dos tareas:
 *
 *  1. Marca como 'vencido' los documentos vigentes que ya pasaron expires_on
 *     y avisa al dueño.
 *  2. Avisa los umbrales de antelación configurados por tipo de documento
 *     (30/15/3 por defecto). Idempotente entre corridas: cada umbral se avisa
 *     una sola vez (documents.alerted_days) y el aviso vuelve a 0 cuando el
 *     documento se aprueba de nuevo.
 *
 * Sin sesión (cron): actor null, igual que el runner de cobranza.
 */
export async function ejecutarAlertasDocumentosCore(clubId: string): Promise<ResultadoAlertasDocumentos> {
  return withTenant(
    clubId,
    async ({ tx, onCommit }) => {
      const hoy = new Date().toISOString().slice(0, 10)

      const { rows: tipos } = await tx.execute<{ kind: string; alert_days: number[] }>(sql`
        SELECT kind, alert_days FROM document_types
        WHERE club_id = ${clubId} AND enabled = true
      `)
      const umbralesPorKind = new Map(tipos.map((t) => [t.kind, [...t.alert_days].sort((a, b) => b - a)]))

      const { rows: docs } = await tx.execute<{
        id: string
        kind: string
        tipo_label: string | null
        expires_on: string | null
        alerted_days: number[]
        owner_user_id: string | null
      }>(sql`
        SELECT d.id, d.kind, dt.label AS tipo_label, d.expires_on, d.alerted_days,
               p.user_id AS owner_user_id
        FROM documents d
        JOIN persons p ON p.id = d.person_id
        LEFT JOIN document_types dt ON dt.club_id = d.club_id AND dt.kind = d.kind::text
        WHERE d.club_id = ${clubId} AND d.deleted_at IS NULL AND d.status = 'vigente'
      `)

      let vencidos = 0
      let alertas = 0
      const DIA_MS = 86_400_000

      for (const doc of docs) {
        if (!doc.expires_on) continue

        const fin = new Date(`${doc.expires_on}T00:00:00`).getTime()
        const inicio = new Date(`${hoy}T00:00:00`).getTime()
        const dias = Math.round((fin - inicio) / DIA_MS)

        if (dias < 0) {
          await tx.execute(sql`
            UPDATE documents SET status = 'vencido'
            WHERE id = ${doc.id} AND club_id = ${clubId}
          `)
          vencidos += 1
          if (doc.owner_user_id) {
            await emitirNotificaciones({ tx, onCommit }, clubId, [
              {
                userId: doc.owner_user_id,
                type: 'documento.vencido',
                title: 'Documento vencido',
                body: `Tu ${doc.tipo_label ?? 'documento'} venció el ${doc.expires_on}. Subí la renovación desde el portal.`,
                data: { documentId: doc.id, kind: doc.kind, expiresOn: doc.expires_on },
              },
            ])
          }
          continue
        }

        const umbrales = umbralesPorKind.get(doc.kind) ?? [30, 15, 3]
        const nuevos: number[] = []
        for (const umbral of umbrales) {
          if (dias <= umbral && !doc.alerted_days.includes(umbral)) {
            nuevos.push(umbral)
            alertas += 1
            if (doc.owner_user_id) {
              const texto = dias === 0 ? 'vence HOY' : `vence en ${dias} día${dias === 1 ? '' : 's'}`
              await emitirNotificaciones({ tx, onCommit }, clubId, [
                {
                  userId: doc.owner_user_id,
                  type: 'documento.proximo_a_vencer',
                  title: `Documento por vencer`,
                  body: `Tu ${doc.tipo_label ?? 'documento'} ${texto} (${doc.expires_on}). Subí la renovación a tiempo.`,
                  data: { documentId: doc.id, kind: doc.kind, expiresOn: doc.expires_on, dias },
                },
              ])
            }
          }
        }
        if (nuevos.length > 0) {
          const dias = `{${[...doc.alerted_days, ...nuevos].join(',')}}`
          await tx.execute(sql`
            UPDATE documents SET alerted_days = ${dias}::int[]
            WHERE id = ${doc.id} AND club_id = ${clubId}
          `)
        }
      }

      return { vencidos, alertas }
    },
    { userId: null },
  )
}
