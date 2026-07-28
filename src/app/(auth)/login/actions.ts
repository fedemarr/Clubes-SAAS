'use server'

import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db/client'
import { users } from '@/db/schema'
import { signEmailToken } from '@/lib/auth/tokens'
import { sendMail } from '@/lib/notifications/mail'
import type { ActionResult } from '../registro/actions'

export async function enviarMagicLink(input: unknown): Promise<ActionResult<null>> {
  const parsed = z.string().email().safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Email inválido' }
  }

  const [user] = await db.select().from(users).where(eq(users.email, parsed.data)).limit(1)
  if (user) {
    const token = await signEmailToken({ userId: user.id, email: user.email, purpose: 'magic-link' })
    const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/magic?token=${token}`
    await sendMail({
      to: user.email,
      subject: 'Tu link de acceso',
      html: `<p>Entrá con este link (vence en 30 minutos): <a href="${url}">${url}</a></p>`,
    })
  }

  // Mismo resultado exista o no el usuario, para no filtrar cuentas.
  return { ok: true, data: null }
}
