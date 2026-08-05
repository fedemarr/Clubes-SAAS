import { eq, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { withTenant } from '@/db/tenant'
import { formatARS } from '@/lib/money'
import { emitirNotificaciones, type NotificacionInput } from '@/lib/notifications/emit'
import { evaluarReglasCobranza } from './service'
import {
  coordinadoresPorDeporte,
  deudoresMorosidad,
  listarContactosRecientes,
  listarReglasCobranza,
  plantillasPorKey,
} from './queries'

export type ResultadoEjecucionCobranza = {
  mensajes: number
  avisosCoordinador: number
  sugerencias: number
  omitidos: number
  porMotivo: Record<string, number>
}

/**
 * Núcleo del motor de cobranza, sin autenticación. Lo usan la Server Action
 * (que exige permiso) y el cron de Vercel (que corre sin sesión). Decide a
 * quién contactar, registra todo en contact_log (para no duplicar y para
 * poder demostrarlo) y emite las notificaciones por el canal transversal.
 * La suspensión solo se sugiere; un humano la resuelve.
 */
export async function ejecutarCobranzaCore(clubId: string): Promise<ResultadoEjecucionCobranza> {
  const [club] = await db
    .select({ name: clubs.name })
    .from(clubs)
    .where(eq(clubs.id, clubId))
    .limit(1)
  const nombreClub = club?.name ?? ''

  const [deudores, reglas, plantillas, coordinadores] = await Promise.all([
    deudoresMorosidad(clubId),
    listarReglasCobranza(clubId),
    plantillasPorKey(clubId),
    coordinadoresPorDeporte(clubId),
  ])
  const activas = reglas.filter((r) => r.enabled)
  if (activas.length === 0) {
    return { mensajes: 0, avisosCoordinador: 0, sugerencias: 0, omitidos: deudores.length, porMotivo: { 'sin reglas activas': deudores.length } }
  }

  const maxDedupe = Math.max(1, ...activas.map((r) => r.dedupeDias))
  const desde = new Date(Date.now() - maxDedupe * 86400000)
  const recientes = await listarContactosRecientes(
    clubId,
    deudores.map((d) => d.accountId),
    desde,
  )

  const deudorACobranza = deudores.map((d) => ({
    accountId: d.accountId,
    deudaCents: d.deudaCents,
    diasDesdeVencimiento: d.diasDesdeVencimiento,
    destino: d.destino
      ? { userId: d.destino.userId, nombre: d.destino.nombre, apellido: d.destino.apellido }
      : null,
  }))
  const holderPorCuenta = new Map(deudores.map((d) => [d.accountId, d] as const))

  const { disparos, omitidos } = evaluarReglasCobranza({
    deudores: deudorACobranza,
    reglas: activas,
    plantillas,
    contactosRecientes: recientes,
    varsDeudor: (d) => {
      const h = holderPorCuenta.get(d.accountId)
      return {
        nombre: h?.destino?.nombre ?? h?.holderNombre ?? '',
        apellido: h?.destino?.apellido ?? h?.holderApellido ?? '',
        monto: formatARS(d.deudaCents),
        club: nombreClub,
      }
    },
  })

  const resultado = await withTenant(
    clubId,
    async ({ tx, audit }) => {
      const notif: NotificacionInput[] = []
      let mensajes = 0
      let avisosCoordinador = 0
      let sugerencias = 0

      for (const s of disparos) {
        let userId: string | null = null
        if (s.kind === 'mensaje') {
          userId = s.destinoUserId
          mensajes += 1
          if (s.destinoUserId) {
            notif.push({
              userId: s.destinoUserId,
              type: 'cobranza.recordatorio',
              title: s.name,
              body: s.body ?? '',
              data: { accountId: s.accountId, ruleId: s.ruleId },
            })
          }
        } else if (s.channel === 'coordinador') {
          const d = holderPorCuenta.get(s.accountId)
          const coord = coordinadores.find((c) => d?.deportes.includes(c.sport))
          userId = coord?.userId ?? null
          avisosCoordinador += 1
          if (coord?.userId) {
            const h = holderPorCuenta.get(s.accountId)
            notif.push({
              userId: coord.userId,
              type: 'cobranza.aviso_coordinador',
              title: s.name,
              body: `Deuda sin resolver: ${h?.holderApellido ?? ''}, ${h?.holderNombre ?? ''} (${h?.deudaCents ? formatARS(h.deudaCents) : ''}).`,
              data: { accountId: s.accountId, ruleId: s.ruleId },
            })
          }
        } else {
          sugerencias += 1
        }

        await tx.execute(sql`
          INSERT INTO contact_log (club_id, account_id, rule_id, user_id, channel, kind, body)
          VALUES (${clubId}, ${s.accountId}, ${s.ruleId}, ${userId}, ${s.channel}, ${s.kind}, ${s.body ?? null})
        `)
        await audit('contact_log', s.accountId, 'custom', {
          action: 'cobranza.disparo',
          ruleId: s.ruleId,
          channel: s.channel,
          kind: s.kind,
        })
      }

      if (notif.length > 0) await emitirNotificaciones(tx, clubId, notif)
      return { mensajes, avisosCoordinador, sugerencias }
    },
    { userId: null },
  )

  const porMotivo: Record<string, number> = {}
  for (const o of omitidos) porMotivo[o.motivo] = (porMotivo[o.motivo] ?? 0) + 1

  return { ...resultado, omitidos: omitidos.length, porMotivo }
}
