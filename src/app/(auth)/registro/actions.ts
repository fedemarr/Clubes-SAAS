'use server'

import { hash } from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db/client'
import { users } from '@/db/schema'
import { signEmailToken } from '@/lib/auth/tokens'
import { sendMail } from '@/lib/notifications/mail'

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
})

async function enviarVerificacion(userId: string, email: string) {
  const token = await signEmailToken({ userId, email, purpose: 'verify-email' })
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/verify?token=${token}`
  await sendMail({
    to: email,
    subject: 'Confirmá tu email',
    html: `<p>Confirmá tu cuenta haciendo clic <a href="${url}">acá</a>. El link vence en 30 minutos.</p>`,
  })
}

export async function registrarUsuario(input: unknown): Promise<ActionResult<{ email: string }>> {
  const parsed = registerSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }
  const { email, password } = parsed.data

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (existing) {
    return { ok: false, error: 'Ya existe una cuenta con ese email' }
  }

  const passwordHash = await hash(password, 12)
  const [user] = await db.insert(users).values({ email, passwordHash }).returning()
  if (!user) {
    return { ok: false, error: 'No se pudo crear la cuenta' }
  }

  await enviarVerificacion(user.id, user.email)

  return { ok: true, data: { email: user.email } }
}

export async function reenviarVerificacion(input: unknown): Promise<ActionResult<null>> {
  const parsed = z.string().email().safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Email inválido' }
  }

  const [user] = await db.select().from(users).where(eq(users.email, parsed.data)).limit(1)
  // No revelar si el email existe o no.
  if (user && !user.emailVerifiedAt) {
    await enviarVerificacion(user.id, user.email)
  }

  return { ok: true, data: null }
}
