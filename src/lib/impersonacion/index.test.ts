import { beforeEach, describe, expect, it } from 'vitest'
import { crearCookieImpersonacion, leerCookieImpersonacionCookieString } from './index'

describe('impersonación', () => {
  beforeEach(() => {
    process.env.IMPERSONAR_SECRET = 'test-super-secret'
  })

  it('valida una cookie recién firmada', () => {
    const cookie = crearCookieImpersonacion('staff', '11111111-1111-4111-8111-111111111111')
    const ctx = leerCookieImpersonacionCookieString(cookie)
    expect(ctx).not.toBeNull()
    expect(ctx?.tipo).toBe('staff')
    expect(ctx?.personaId).toBe('11111111-1111-4111-8111-111111111111')
    expect(ctx?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000))
  })

  it('rechaza una firma alterada', () => {
    const cookie = crearCookieImpersonacion('socio', '22222222-2222-4222-8222-222222222222')
    const corrupta = cookie.replace(/^socio/, 'staff')
    expect(leerCookieImpersonacionCookieString(corrupta)).toBeNull()
  })

  it('rechaza tipo inválido', () => {
    const cookie = crearCookieImpersonacion('staff', '33333333-3333-4333-8333-333333333333')
    expect(leerCookieImpersonacionCookieString(cookie.replace(/^staff/, 'admin'))).toBeNull()
  })

  it('rechaza personaId malformado', () => {
    const cookie = crearCookieImpersonacion('staff', 'no-es-un-uuid')
    expect(leerCookieImpersonacionCookieString(cookie)).toBeNull()
  })

  it('rechaza expirada', () => {
    const cookie = crearCookieImpersonacion('staff', '44444444-4444-4444-8444-444444444444')
    const [payload, firma] = cookie.split('.')
    const partes = payload.split(':')
    const expiradas = `${partes[0]}:${partes[1]}:1.${firma}`
    expect(leerCookieImpersonacionCookieString(expiradas)).toBeNull()
    expect(leerCookieImpersonacionCookieString(cookie)).not.toBeNull()
  })

  it('sin secreto configurado devuelve null (no tira)', () => {
    delete process.env.IMPERSONAR_SECRET
    expect(leerCookieImpersonacionCookieString('cualquier.cosa')).toBeNull()
  })
})