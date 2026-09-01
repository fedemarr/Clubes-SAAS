import { createHmac, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'

/**
 * Impersonación (M14): el super admin puede "entrar" a un club como un
 * miembro del staff o del portal para debug. Se firma una cookie corta
 * `impersonacion` = `tipo:personaId:exp.firma` (HMAC-SHA256 con
 * IMPERSONAR_SECRET, distinto de AUTH_SECRET). No se toca la sesión real.
 *
 * Los consumidores de identidad (rolesEnClub en src/lib/permissions y
 * esSuperAdmin en src/lib/super-admin) chequean arriba de la sesión:
 * si hay una cookie válida, la identidad efectiva pasa a ser la persona
 * impersonada y el acceso a /super-admin queda bloqueado hasta salir.
 */

export type ImpersonacionCtx = {
  tipo: 'staff' | 'socio'
  personaId: string
  exp: number
}

export const COOKIE_IMPRESION = 'impersonacion'
const SEGUNDOS = 15 * 60

function secret(): Buffer {
  const s = process.env.IMPERSONAR_SECRET
  if (!s) throw new Error('Falta IMPERSONAR_SECRET en .env.local')
  return Buffer.from(s)
}

function firmar(valor: string): string {
  return createHmac('sha256', secret()).update(valor).digest('hex')
}

/** Valida y parsea el valor de la cookie firmada. Puro y testeable. */
export function leerCookieImpersonacionCookieString(raw: string): ImpersonacionCtx | null {
  try {
    const idx = raw.lastIndexOf('.')
    if (idx < 0) return null
    const valor = raw.slice(0, idx)
    const firma = raw.slice(idx + 1)

    const a = Buffer.from(firma, 'hex')
    const b = Buffer.from(firmar(valor), 'hex')
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null

    const [tipo, personaId, expStr] = valor.split(':')
    if (tipo !== 'staff' && tipo !== 'socio') return null
    if (!personaId || !/^[0-9a-f-]{36}$/.test(personaId)) return null
    const exp = Number(expStr)
    if (!Number.isInteger(exp) || exp < Math.floor(Date.now() / 1000)) return null

    return { tipo, personaId, exp }
  } catch {
    return null
  }
}

/** Lee y valida la cookie de impersonación actual (si existe). */
export async function identidadImpersonada(): Promise<ImpersonacionCtx | null> {
  try {
    const store = await cookies()
    const raw = store.get(COOKIE_IMPRESION)?.value
    if (!raw) return null
    return leerCookieImpersonacionCookieString(raw)
  } catch {
    return null
  }
}

/** Crea el valor de la cookie para una persona (usar con cookies().set). */
export function crearCookieImpersonacion(tipo: 'staff' | 'socio', personaId: string): string {
  const exp = Math.floor(Date.now() / 1000) + SEGUNDOS
  return `${tipo}:${personaId}:${exp}.${firmar(`${tipo}:${personaId}:${exp}`)}`
}

/** Setea la cookie (Server Actions). */
export async function setearCookieImpersonacion(tipo: 'staff' | 'socio', personaId: string): Promise<void> {
  const store = await cookies()
  store.set(COOKIE_IMPRESION, crearCookieImpersonacion(tipo, personaId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SEGUNDOS,
  })
}

/** Borra la cookie (Server Actions). */
export async function limpiarCookieImpersonacion(): Promise<void> {
  const store = await cookies()
  store.set(COOKIE_IMPRESION, '', { path: '/', maxAge: 0 })
}