import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { ejecutarCobranzaCore } from '@/modules/morosidad/runner'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Cron de Vercel (ver vercel.json). Corre el motor de cobranza de todos los
 * clubes a las 12:00 UTC (09:00 Argentina), cuando ya terminó el silencio
 * nocturno. El propio motor vuelve a chequear el horario y el dedupe antes
 * de enviar nada.
 *
 * Seguridad: sin CRON_SECRET exige el header x-vercel-cron que solo Vercel
 * manda. Con CRON_SECRET configurado exige `Authorization: Bearer <secret>`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const isVercel = req.headers.get('x-vercel-cron') !== null
  const auth = req.headers.get('authorization')

  const autorizado = secret
    ? auth === `Bearer ${secret}`
    : isVercel

  if (!autorizado) {
    return Response.json({ error: 'no autorizado' }, { status: 401 })
  }

  const todos = await db.select({ id: clubs.id, name: clubs.name }).from(clubs)
  const porClub: { club: string; resultado: unknown; error?: string }[] = []

  for (const c of todos) {
    try {
      const resultado = await ejecutarCobranzaCore(c.id)
      porClub.push({ club: c.name, resultado })
    } catch (e) {
      console.error('[cron:cobranza]', c.name, e)
      porClub.push({ club: c.name, resultado: null, error: e instanceof Error ? e.message : 'error' })
    }
  }

  return Response.json({ corrida: new Date().toISOString(), clubes: porClub })
}
