import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { ejecutarAlertasDocumentosCore } from '@/modules/documentos/runner'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Cron de Vercel (ver vercel.json). Corre las alertas de vencimiento de
 * documentos de todos los clubes una vez por día (13:00 UTC, después de la
 * corrida de cobranza). Mismo guard de seguridad que /api/cron/cobranza.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const isVercel = req.headers.get('x-vercel-cron') !== null
  const auth = req.headers.get('authorization')

  const autorizado = secret ? auth === `Bearer ${secret}` : isVercel

  if (!autorizado) {
    return Response.json({ error: 'no autorizado' }, { status: 401 })
  }

  const todos = await db.select({ id: clubs.id, name: clubs.name }).from(clubs)
  const porClub: { club: string; resultado: unknown; error?: string }[] = []

  for (const c of todos) {
    try {
      const resultado = await ejecutarAlertasDocumentosCore(c.id)
      porClub.push({ club: c.name, resultado })
    } catch (e) {
      console.error('[cron:documentos]', c.name, e)
      porClub.push({ club: c.name, resultado: null, error: e instanceof Error ? e.message : 'error' })
    }
  }

  return Response.json({ corrida: new Date().toISOString(), clubes: porClub })
}
