import { jwtVerify, SignJWT } from 'jose'

const TOKEN_TTL = '30m'

function secretKey() {
  if (!process.env.AUTH_SECRET) {
    throw new Error('AUTH_SECRET no está seteada (revisá .env.local)')
  }
  return new TextEncoder().encode(process.env.AUTH_SECRET)
}

export type EmailTokenPurpose = 'verify-email' | 'magic-link'

export type EmailTokenPayload = {
  userId: string
  email: string
  purpose: EmailTokenPurpose
}

/**
 * Tokens de un solo propósito, firmados y de vida corta (30 min).
 * No hay tabla de tokens en el schema: la verificación es stateless,
 * a costa de no poder revocarlos antes de que expiren.
 */
export async function signEmailToken(payload: EmailTokenPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(secretKey())
}

export async function verifyEmailToken(
  token: string,
  purpose: EmailTokenPurpose,
): Promise<EmailTokenPayload> {
  const { payload } = await jwtVerify<EmailTokenPayload>(token, secretKey())
  if (payload.purpose !== purpose) {
    throw new Error('Token de propósito incorrecto')
  }
  return payload
}
