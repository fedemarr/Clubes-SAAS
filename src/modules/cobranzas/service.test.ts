import { describe, expect, it } from 'vitest'
import { estadoCargoDespuesDePago, imputarPagoFIFO, parsearPesosACentavos } from './service'

const cargo = (id: string, dueOn: string, saldoCents: number) => ({ id, dueOn, saldoCents })

describe('imputarPagoFIFO', () => {
  it('paga primero el vencimiento más viejo', () => {
    const cargos = [
      cargo('c3', '2026-08-10', 5000000),
      cargo('c1', '2026-07-10', 6500000),
      cargo('c2', '2026-08-10', 1000000),
    ]
    const r = imputarPagoFIFO(cargos, 7000000)
    expect(r.imputaciones).toEqual([{ chargeId: 'c1', amountCents: 6500000 }, { chargeId: 'c2', amountCents: 500000 }])
    expect(r.sobranteCents).toBe(0)
  })

  it('imputa parcialmente sobre dos cargos', () => {
    const r = imputarPagoFIFO([cargo('a', '2026-07-10', 6500000), cargo('b', '2026-08-10', 5000000)], 8000000)
    expect(r.imputaciones).toEqual([
      { chargeId: 'a', amountCents: 6500000 },
      { chargeId: 'b', amountCents: 1500000 },
    ])
    expect(r.sobranteCents).toBe(0)
  })

  it('devuelve sobrante "a cuenta" cuando paga de más', () => {
    const r = imputarPagoFIFO([cargo('a', '2026-07-10', 6500000)], 7000000)
    expect(r.imputaciones).toEqual([{ chargeId: 'a', amountCents: 6500000 }])
    expect(r.sobranteCents).toBe(500000)
  })

  it('ignora cargos con saldo 0 y devuelve todo como sobrante', () => {
    const r = imputarPagoFIFO([cargo('a', '2026-07-10', 0), cargo('b', '2026-08-10', 0)], 100000)
    expect(r.imputaciones).toEqual([])
    expect(r.sobranteCents).toBe(100000)
  })

  it('devuelve imputaciones vacías para monto cero o negativo', () => {
    expect(imputarPagoFIFO([cargo('a', '2026-07-10', 100000)], 0).sobranteCents).toBe(0)
    expect(imputarPagoFIFO([cargo('a', '2026-07-10', 100000)], -500).imputaciones).toEqual([])
  })

  it('sin cargos abiertos, todo el monto es sobrante', () => {
    const r = imputarPagoFIFO([], 12345)
    expect(r.imputaciones).toEqual([])
    expect(r.sobranteCents).toBe(12345)
  })
})

describe('estadoCargoDespuesDePago', () => {
  it('pagado cuando el acumulado alcanza el total', () => {
    expect(estadoCargoDespuesDePago(6500000, 6500000)).toBe('pagado')
    expect(estadoCargoDespuesDePago(6500000, 7000000)).toBe('pagado')
  })
  it('parcial cuando recibió algo pero no alcanza', () => {
    expect(estadoCargoDespuesDePago(6500000, 2000000)).toBe('parcial')
  })
  it('pendiente sin pagos', () => {
    expect(estadoCargoDespuesDePago(6500000, 0)).toBe('pendiente')
  })
})

describe('parsearPesosACentavos', () => {
  it('parsea formato argentino con punto de miles y coma decimal', () => {
    expect(parsearPesosACentavos('65.000,50')).toBe(6500050)
    expect(parsearPesosACentavos('1.234.567,89')).toBe(123456789)
  })
  it('parsea entero simple', () => {
    expect(parsearPesosACentavos('65000')).toBe(6500000)
  })
  it('parsea punto como separador decimal', () => {
    expect(parsearPesosACentavos('65000.5')).toBe(6500050)
  })
  it('parsea coma sin miles', () => {
    expect(parsearPesosACentavos('65000,5')).toBe(6500050)
  })
  it('ignora texto vacío o no numérico', () => {
    expect(parsearPesosACentavos('')).toBe(0)
    expect(parsearPesosACentavos('abc')).toBe(0)
  })
})
