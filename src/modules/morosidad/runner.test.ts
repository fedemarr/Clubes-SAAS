import { and, eq, isNull } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { withTenant } from '@/db/tenant'

// El canal mail entrega afuera del motor: acá se captura el envío real para
// verificar que el runner decide cuándo (y a quién) mandar, sin mandar nada.
const { sendMailMock } = vi.hoisted(() => ({ sendMailMock: vi.fn() }))
vi.mock('@/lib/notifications/mail', () => ({ sendMail: sendMailMock }))

import { ejecutarCobranzaCore } from './runner'

async function clubIdDe(slug: string): Promise<string> {
  const [club] = await db
    .select()
    .from(clubs)
    .where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)))
    .limit(1)
  if (!club) throw new Error(`Club de prueba "${slug}" no encontrado — corré "npm run db:seed" primero`)
  return club.id
}

async function contarContactLog(clubId: string): Promise<number> {
  return withTenant(clubId, async ({ tx }) => {
    const { rows } = await tx.execute<{ n: number }>(
      `SELECT count(*)::int AS n FROM contact_log WHERE club_id = '${clubId}'`,
    )
    return rows[0]?.n ?? 0
  })
}

const FORMA = {
  mensajes: expect.any(Number),
  avisosCoordinador: expect.any(Number),
  sugerencias: expect.any(Number),
  mailsEnviados: expect.any(Number),
  omitidos: expect.any(Number),
  porMotivo: expect.any(Object),
}

/**
 * El runner corre contra la base real (Neon compartida, como el resto de los
 * tests de integración del repo). Usa los-cedros del seed, que tiene 10
 * cuentas deudoras y las 4 reglas por defecto activas. Las corridas se
 * registran en contact_log (como en producción); por eso la segunda corrida
 * del mismo archivo ya ve la dedupe activa.
 */
describe('ejecutarCobranzaCore — runner contra la base', () => {
  it('corre el motor, registra cada disparo en contact_log y encola los mails por canal', async () => {
    const clubId = await clubIdDe('los-cedros')
    const antes = await contarContactLog(clubId)
    const llamadasAntes = sendMailMock.mock.calls.length

    const resultado = await ejecutarCobranzaCore(clubId)

    expect(resultado).toMatchObject(FORMA)
    expect(resultado.mensajes).toBeGreaterThanOrEqual(0)
    expect(resultado.mailsEnviados).toBeGreaterThanOrEqual(0)
    expect(resultado.porMotivo).toBeDefined()

    const despues = await contarContactLog(clubId)
    expect(despues - antes).toBe(resultado.mensajes + resultado.avisosCoordinador + resultado.sugerencias)

    // Todo disparo de canal mail termina en sendMail(), con destinatario.
    const nuevasLlamadas = sendMailMock.mock.calls.slice(llamadasAntes)
    expect(nuevasLlamadas).toHaveLength(resultado.mailsEnviados)
    for (const args of nuevasLlamadas) {
      const { to, subject, html } = args[0] as { to: string; subject: string; html: string }
      expect(to).toContain('@')
      expect(subject).not.toBe('')
      expect(html).not.toBe('')
    }
  })

  it('la dedupe contra contact_log impide re-contactar la misma cuenta dentro de la ventana', async () => {
    const clubId = await clubIdDe('los-cedros')
    const llamadasAntes = sendMailMock.mock.calls.length

    // Acabamos de correr en el test anterior: los disparos de mensajes quedaron
    // en contact_log con delivered_at = ahora, dentro de dedupeDias de cada regla.
    const resultado = await ejecutarCobranzaCore(clubId)

    expect(resultado.mensajes).toBe(0)
    expect(resultado.mailsEnviados).toBe(0)
    expect(sendMailMock.mock.calls.length).toBe(llamadasAntes)
  })
})
