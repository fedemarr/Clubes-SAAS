'use server'

import { hash } from 'bcryptjs'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db/client'
import { clubs, users } from '@/db/schema'
import { withTenant } from '@/db/tenant'
import { signEmailToken } from '@/lib/auth/tokens'
import { sendMail } from '@/lib/notifications/mail'

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  clubSlug: z.string().optional(),
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
  const { email, password, clubSlug } = parsed.data

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (existing) {
    return { ok: false, error: 'Ya existe una cuenta con ese email' }
  }

  const passwordHash = await hash(password, 12)

  // `users` es global (sin club_id), pero el alta siempre ocurre en el
  // contexto de un club (viene de la URL: /registro?club=<slug>). Si se
  // puede resolver ese club, el insert y su auditoría van atados a la
  // misma transacción de withTenant(); si no hay club en la URL (o no
  // existe), se crea igual pero sin fila de auditoría — no hay club_id
  // con el cual escribirla (audit_log lo exige NOT NULL).
  const club = clubSlug
    ? (await db.select().from(clubs).where(and(eq(clubs.slug, clubSlug), isNull(clubs.deletedAt))).limit(1))[0]
    : undefined

  const user = club
    ? await withTenant(club.id, async ({ tx, audit }) => {
        const [row] = await tx.insert(users).values({ email, passwordHash }).returning()
        if (row) await audit('users', row.id, 'create', { email: row.email, clubSlug: club.slug })
        return row
      })
    : (await db.insert(users).values({ email, passwordHash }).returning())[0]

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
