import { describe, expect, it } from 'vitest'
import {
  calcularMontosHermanos,
  descuentosPorHermano,
  planVigente,
  validarNuevaVersion,
} from './service'

describe('descuentosPorHermano', () => {
  it('[0,20,40] con 3 hermanos → [0,20,40]', () => {
    expect(descuentosPorHermano([0, 20, 40], 3)).toEqual([0, 20, 40])
  })

  it('más hermanos que descuentos configurados → cero para el resto', () => {
    expect(descuentosPorHermano([0, 20], 5)).toEqual([0, 20, 0, 0, 0])
  })

  it('sin arreglo → todos pagan completo', () => {
    expect(descuentosPorHermano(null, 3)).toEqual([0, 0, 0])
  })

  it('hijo único → cero descuento', () => {
    expect(descuentosPorHermano([0, 20, 40], 1)).toEqual([0])
  })
})

describe('calcularMontosHermanos', () => {
  const plan = (planId: string, amountCents: number, siblingDiscounts: number[] | null) => ({
    planId,
    amountCents,
    siblingDiscounts,
  })

  it('familia de la aceptación: 2 rugby (65000) + 1 hockey (72000) con [0,20,40]', () => {
    const resultado = calcularMontosHermanos([
      plan('rugby-a', 6500000, [0, 20, 40]),
      plan('hockey', 7200000, [0, 20, 40]),
      plan('rugby-b', 6500000, [0, 20, 40]),
    ])
    // Ordenados por monto desc: hockey (más cara) paga completo; los rugby
    // son 2º y 3º hermano → 20% y 40%.
    expect(resultado.map((r) => r.planId)).toEqual(['hockey', 'rugby-a', 'rugby-b'])
    expect(resultado.map((r) => r.descuentoPct)).toEqual([0, 20, 40])
    expect(resultado.map((r) => r.montoFinalCents)).toEqual([7200000, 5200000, 3900000])
  })

  it('descuentos acumulativos sobre las más baratas, no sobre la cara', () => {
    const resultado = calcularMontosHermanos([
      plan('cara', 1000000, [0, 10, 30]),
      plan('barata', 500000, [0, 10, 30]),
      plan('media', 700000, [0, 10, 30]),
    ])
    expect(resultado.find((r) => r.planId === 'cara')!.descuentoPct).toBe(0)
    expect(resultado.find((r) => r.planId === 'media')!.descuentoPct).toBe(10)
    expect(resultado.find((r) => r.planId === 'barata')!.descuentoPct).toBe(30)
  })

  it('montos con descuento se redondean al centavo', () => {
    const resultado = calcularMontosHermanos([plan('a', 3333, [0, 50]), plan('b', 2000, [0, 50])])
    expect(resultado.find((r) => r.planId === 'b')!.montoFinalCents).toBe(1000)
    expect(resultado.find((r) => r.planId === 'a')!.montoFinalCents).toBe(3333)
  })
})

describe('planVigente', () => {
  const versiones = [
    { id: 'v1', validFrom: '2026-01-01', validTo: '2026-02-28' },
    { id: 'v2', validFrom: '2026-03-01', validTo: null },
  ]

  it('devuelve la versión vigente para una fecha', () => {
    expect(planVigente(versiones, '2026-02-01')?.id).toBe('v1')
    expect(planVigente(versiones, '2026-05-01')?.id).toBe('v2')
  })

  it('fuera de rango → undefined (el precio viejo no se pisa, no se borra)', () => {
    expect(planVigente(versiones, '2025-12-31')).toBeUndefined()
  })
})

describe('validarNuevaVersion', () => {
  it('acepta una versión que arranca después de la vigente', () => {
    expect(validarNuevaVersion([{ id: 'v1', validFrom: '2026-01-01', validTo: null }], '2026-07-01')).toBeNull()
  })

  it('rechaza una versión que no avanza respecto de la vigente', () => {
    const error = validarNuevaVersion([{ id: 'v1', validFrom: '2026-01-01', validTo: null }], '2026-01-01')
    expect(error).toContain('debe arrancar después')
  })
})
