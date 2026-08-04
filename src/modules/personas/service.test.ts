import { describe, expect, it } from 'vitest'
import { esMenorDeEdad, puedeEstarActivo, rolVigente } from './service'

describe('esMenorDeEdad', () => {
  const hoy = new Date('2026-07-29')

  it('es menor si todavía no cumplió 18', () => {
    expect(esMenorDeEdad('2010-08-01', hoy)).toBe(true) // cumple en agosto, hoy es julio
  })

  it('no es menor si ya cumplió 18', () => {
    expect(esMenorDeEdad('2008-07-01', hoy)).toBe(false)
  })

  it('no es menor el mismo día que cumple 18', () => {
    expect(esMenorDeEdad('2008-07-29', hoy)).toBe(false)
  })

  it('sin fecha de nacimiento, se asume mayor', () => {
    expect(esMenorDeEdad(undefined, hoy)).toBe(false)
    expect(esMenorDeEdad(null, hoy)).toBe(false)
  })
})

describe('puedeEstarActivo', () => {
  it('menor sin tutores no puede estar activo', () => {
    const r = puedeEstarActivo({ bornOn: '2015-01-01', status: 'activo' }, 0)
    expect(r.ok).toBe(false)
  })

  it('menor con al menos un tutor sí puede estar activo', () => {
    const r = puedeEstarActivo({ bornOn: '2015-01-01', status: 'activo' }, 1)
    expect(r.ok).toBe(true)
  })

  it('mayor de edad no necesita tutor', () => {
    const r = puedeEstarActivo({ bornOn: '1990-01-01', status: 'activo' }, 0)
    expect(r.ok).toBe(true)
  })

  it('si el status no es activo, no aplica la regla aunque sea menor sin tutor', () => {
    const r = puedeEstarActivo({ bornOn: '2015-01-01', status: 'pendiente_aprobacion' }, 0)
    expect(r.ok).toBe(true)
  })
})

describe('rolVigente', () => {
  it('sin validTo, siempre vigente', () => {
    expect(rolVigente(null, '2026-07-29')).toBe(true)
  })

  it('con validTo futuro, vigente', () => {
    expect(rolVigente('2026-12-31', '2026-07-29')).toBe(true)
  })

  it('con validTo pasado, no vigente', () => {
    expect(rolVigente('2026-01-01', '2026-07-29')).toBe(false)
  })

  it('con validTo hoy, todavía vigente (inclusive)', () => {
    expect(rolVigente('2026-07-29', '2026-07-29')).toBe(true)
  })
})
