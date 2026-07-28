import { compare } from 'bcryptjs'
import { eq } from 'drizzle-orm'
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { z } from 'zod'
import { db } from '@/db/client'
import { users } from '@/db/schema'
import { verifyEmailToken } from './tokens'

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

/**
 * Sin adapter: schema.ts no tiene accounts/sessions/verification_tokens
 * (y no se puede tocar el schema), así que la sesión es JWT stateless.
 * `users` no lleva club_id -> no pasa por withTenant, no está bajo RLS.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      id: 'credentials',
      name: 'Credentials',
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw)
        if (!parsed.success) return null

        const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1)
        if (!user || !user.passwordHash || user.deletedAt) return null

        const valid = await compare(parsed.data.password, user.passwordHash)
        if (!valid) return null

        return {
          id: user.id,
          email: user.email,
          emailVerified: user.emailVerifiedAt !== null,
        }
      },
    }),
    Credentials({
      id: 'magic-link',
      name: 'Magic Link',
      credentials: { token: {} },
      async authorize(raw) {
        const token = typeof raw?.token === 'string' ? raw.token : null
        if (!token) return null

        try {
          const payload = await verifyEmailToken(token, 'magic-link')
          const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1)
          if (!user || user.deletedAt) return null

          if (!user.emailVerifiedAt) {
            await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, user.id))
          }

          return { id: user.id, email: user.email, emailVerified: true }
        } catch {
          return null
        }
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // Verificación de email obligatoria: sin esto no entra por ningún provider.
      return user.emailVerified === true
    },
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id
      return token
    },
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub
      return session
    },
  },
})
