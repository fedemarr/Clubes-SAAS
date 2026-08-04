import { describe, expect, it } from 'vitest'
import { expandirOcurrenciasSemana, construirFilasEvento, RECURRENCIA_MAX_SEMANAS, esMenor } from './service'

describe('expandirOcurrenciasSemana', () => {
  it('genera ocurrencias cada 7 días incluyendo desde y hasta', () => {
    const desde = new Date('2026-08-04T18:00:00Z')
    const hasta = new Date('2026-09-01T23:59:59Z')
    const oc = expandirOcurrenciasSemana(desde, hasta)
    expect(oc.length).toBe(5)
    expect(oc[0]?.getTime()).toBe(desde.getTime())
    expect(oc[1]?.getTime()).toBe(desde.getTime() + 7 * 24 * 60 * 60 * 1000)
  })

  it('no excede MAX_SEMANAS', () => {
    const desde = new Date('2026-01-05T18:00:00Z')
    const hasta = new Date('2027-01-05T23:59:59Z')
    const oc = expandirOcurrenciasSemana(desde, hasta)
    expect(oc.length).toBe(RECURRENCIA_MAX_SEMANAS)
  })

  it('cuando hasta < desde devuelve vacío', () => {
    const desde = new Date('2026-09-01T18:00:00Z')
    const hasta = new Date('2026-08-01T23:59:59Z')
    const oc = expandirOcurrenciasSemana(desde, hasta)
    expect(oc).toHaveLength(0)
  })

  it('un solo día (desde == hasta) genera una sola ocurrencia', () => {
    const desde = new Date('2026-08-04T18:00:00Z')
    const oc = expandirOcurrenciasSemana(desde, desde)
    expect(oc).toHaveLength(1)
  })
})

describe('construirFilasEvento', () => {
  it('evento sin recurrencia genera una fila con endsAt por defecto', () => {
    const result = construirFilasEvento({
      kind: 'entrenamiento',
      startsAt: '2026-08-04T18:00:00Z',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.filas).toHaveLength(1)
      expect(result.filas[0]!.endsAt.getTime()).toBe(result.filas[0]!.startsAt.getTime() + 60 * 60 * 1000)
      expect(result.filas[0]!.meta).toBeNull()
    }
  })

  it('evento sin recurrencia respeta endsAt explícito', () => {
    const result = construirFilasEvento({
      kind: 'entrenamiento',
      startsAt: '2026-08-04T18:00:00Z',
      endsAt: '2026-08-04T19:30:00Z',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.filas[0]!.endsAt.getTime()).toBe(result.filas[0]!.startsAt.getTime() + 90 * 60 * 1000)
    }
  })

  it('endsAt <= startsAt produce error', () => {
    const result = construirFilasEvento({
      kind: 'entrenamiento',
      startsAt: '2026-08-04T18:00:00Z',
      endsAt: '2026-08-04T17:00:00Z',
    })
    expect(result.ok).toBe(false)
  })

  it('entrenamiento recurrente genera múltiples filas con meta', () => {
    const result = construirFilasEvento({
      kind: 'entrenamiento',
      startsAt: '2026-08-04T18:00:00Z',
      recurrenciaSemanalHasta: '2026-09-01',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.filas.length).toBe(5)
      expect(result.filas[0]!.meta).toEqual({ recurrencia: { orden: 1 } })
      expect(result.filas[1]!.meta).toEqual({ recurrencia: { orden: 2 } })
      expect(result.filas[4]!.meta).toEqual({ recurrencia: { orden: 5 } })
    }
  })

  it('partido con recurrencia produce error', () => {
    const result = construirFilasEvento({
      kind: 'partido',
      startsAt: '2026-08-04T18:00:00Z',
      recurrenciaSemanalHasta: '2026-09-01',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('recurrencia')
    }
  })

  it('hasta anterior a desde produce error', () => {
    const result = construirFilasEvento({
      kind: 'entrenamiento',
      startsAt: '2026-09-01T18:00:00Z',
      recurrenciaSemanalHasta: '2026-08-01',
    })
    expect(result.ok).toBe(false)
  })

  it('recurrencia que excede el máximo produce error', () => {
    const result = construirFilasEvento({
      kind: 'entrenamiento',
      startsAt: '2026-01-05T18:00:00Z',
      recurrenciaSemanalHasta: '2027-06-01',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain(String(RECURRENCIA_MAX_SEMANAS))
    }
  })
})

describe('esMenor', () => {
  const hoy = new Date('2026-08-04T12:00:00Z')

  it('recién nacido es menor', () => {
    expect(esMenor('2024-01-01', hoy)).toBe(true)
  })

  it('alguien de 17 con cumpleaños próximo es menor', () => {
    expect(esMenor('2008-12-31', hoy)).toBe(true)
  })

  it('alguien que cumple 18 hoy ya no es menor', () => {
    expect(esMenor('2008-08-04', hoy)).toBe(false)
  })

  it('alguien de 18 que cumple en diciembre todavía es menor', () => {
    expect(esMenor('2008-12-31', hoy)).toBe(true)
  })

  it('mayor de 18 no es menor', () => {
    expect(esMenor('2000-05-20', hoy)).toBe(false)
  })

  it('sin fecha de nacimiento no se considera menor', () => {
    expect(esMenor(null, hoy)).toBe(false)
  })
})
