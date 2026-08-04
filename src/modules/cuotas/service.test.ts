import { describe, expect, it } from 'vitest'
import {
  calcularMontosHermanos,
  descuentosPorHermano,
  planVigente,
  validarNuevaVersion,
  diasEnMes,
  diasActivosEnPeriodo,
  prorratearMonto,
  resolverVencimiento,
  generarCargosDelMes,
  saldoDesdeMovimientos,
  validarMotivo,
} from './service'
import type { ConfigFinanzas, PlanConMonto } from './service'

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
  const plan = (key: string, amountCents: number, siblingDiscounts: number[] | null) => ({
    key,
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
    expect(resultado.map((r) => r.key)).toEqual(['hockey', 'rugby-a', 'rugby-b'])
    expect(resultado.map((r) => r.descuentoPct)).toEqual([0, 20, 40])
    expect(resultado.map((r) => r.montoFinalCents)).toEqual([7200000, 5200000, 3900000])
  })

  it('dos hermanos del MISMO plan (misma clave es bug): keys únicas por membresía', () => {
    // Dos chicos en rugby comparten fee_plan_id, pero cada membresía es una key.
    const resultado = calcularMontosHermanos([
      plan('m1', 6500000, [0, 20, 40]),
      plan('m2', 6500000, [0, 20, 40]),
    ])
    expect(resultado.map((r) => r.descuentoPct)).toEqual([0, 20])
    expect(resultado.map((r) => r.montoFinalCents)).toEqual([6500000, 5200000])
  })

  it('descuentos acumulativos sobre las más baratas, no sobre la cara', () => {
    const resultado = calcularMontosHermanos([
      plan('cara', 1000000, [0, 10, 30]),
      plan('barata', 500000, [0, 10, 30]),
      plan('media', 700000, [0, 10, 30]),
    ])
    expect(resultado.find((r) => r.key === 'cara')!.descuentoPct).toBe(0)
    expect(resultado.find((r) => r.key === 'media')!.descuentoPct).toBe(10)
    expect(resultado.find((r) => r.key === 'barata')!.descuentoPct).toBe(30)
  })

  it('montos con descuento se redondean al centavo', () => {
    const resultado = calcularMontosHermanos([plan('a', 3333, [0, 50]), plan('b', 2000, [0, 50])])
    expect(resultado.find((r) => r.key === 'b')!.montoFinalCents).toBe(1000)
    expect(resultado.find((r) => r.key === 'a')!.montoFinalCents).toBe(3333)
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

describe('M3.2 generación mensual', () => {
  const config: ConfigFinanzas = { prorrateoParcial: 'prorratear', vencimientoDia: 10 }

  const plan = (id: string, amountCents: number, validFrom: string, validTo: string | null = null, opts: Partial<PlanConMonto> = {}): PlanConMonto => ({
    id,
    sport: 'rugby',
    name: 'Cuota Rugby',
    amountCents,
    siblingDiscounts: [0, 20, 40],
    validFrom,
    validTo,
    ...opts,
  })

  it('diasEnMes con años bisiestos', () => {
    expect(diasEnMes('2026-02')).toBe(28)
    expect(diasEnMes('2024-02')).toBe(29)
    expect(diasEnMes('2026-07')).toBe(31)
  })

  it('diasActivosEnPeriodo: mes completo, alta a mitad de mes, baja a mitad de mes', () => {
    expect(diasActivosEnPeriodo('2026-01-01', null, '2026-01')).toBe(31)
    expect(diasActivosEnPeriodo('2026-01-15', null, '2026-01')).toBe(17)
    expect(diasActivosEnPeriodo('2026-01-01', '2026-01-10', '2026-01')).toBe(10)
    expect(diasActivosEnPeriodo('2026-02-01', '2026-01-31', '2026-01')).toBe(0)
  })

  it('prorratearMonto según config', () => {
    expect(prorratearMonto(6500000, 17, 31, config)).toBe(Math.round((6500000 * 17) / 31))
    expect(prorratearMonto(6500000, 31, 31, config)).toBe(6500000)
    expect(prorratearMonto(6500000, 17, 31, { ...config, prorrateoParcial: 'completo' })).toBe(6500000)
    expect(prorratearMonto(6500000, 17, 31, { ...config, prorrateoParcial: 'no_cobrar' })).toBeNull()
  })

  it('resolverVencimiento recorta al fin de mes', () => {
    expect(resolverVencimiento('2026-07', 10)).toBe('2026-07-10')
    expect(resolverVencimiento('2026-02', 30)).toBe('2026-02-28')
    expect(resolverVencimiento('2026-02', 5)).toBe('2026-02-05')
  })

  it('genera cargos de una familia con descuento por hermano y los ordena por cuenta', () => {
    const planes = [
      plan('p-rugby', 6500000, '2026-01-01'),
      plan('p-hockey', 7200000, '2026-01-01', null, { sport: 'hockey', name: 'Cuota Hockey' }),
    ]
    const membresias = [
      { id: 'm1', accountId: 'a1', personId: 'kid1', startedOn: '2026-01-01', endedOn: null, sport: 'rugby' },
      { id: 'm2', accountId: 'a1', personId: 'kid2', startedOn: '2026-01-01', endedOn: null, sport: 'rugby' },
      { id: 'm3', accountId: 'a1', personId: 'kid3', startedOn: '2026-01-01', endedOn: null, sport: 'hockey' },
    ]
    const r = generarCargosDelMes('2026-07', config, membresias, planes)
    expect(r.omitidos).toEqual([])
    expect(r.cargos).toHaveLength(3)
    const m1 = r.cargos.find((c) => c.membershipId === 'm1')!
    const m2 = r.cargos.find((c) => c.membershipId === 'm2')!
    const m3 = r.cargos.find((c) => c.membershipId === 'm3')!
    expect(m3.amountCents).toBe(7200000)
    expect(m1.amountCents).toBe(5200000)
    expect(m2.amountCents).toBe(3900000)
    expect(r.cargos.every((c) => c.dueOn === '2026-07-10')).toBe(true)
    expect(r.cargos.every((c) => c.concept === 'Cuota rugby · 07/2026' || c.concept === 'Cuota hockey · 07/2026')).toBe(true)
  })

  it('prorratea el alta a mitad de mes antes de aplicar el descuento', () => {
    const planes = [plan('p-rugby', 6500000, '2026-01-01')]
    const membresias = [
      { id: 'm1', accountId: 'a1', personId: 'kid1', startedOn: '2026-07-15', endedOn: null, sport: 'rugby' },
    ]
    const r = generarCargosDelMes('2026-07', config, membresias, planes)
    const esperado = Math.round((6500000 * 17) / 31)
    expect(r.cargos[0]!.amountCents).toBe(esperado)
    expect(r.cargos[0]!.descuentoPct).toBe(0)
  })

  it('resuelve el plan vigente del período, no el de hoy', () => {
    // En julio hay una versión nueva (50000); la vieja venció en junio.
    const planes = [
      plan('p-viejo', 6500000, '2026-01-01', '2026-06-30'),
      plan('p-nuevo', 5000000, '2026-07-01'),
    ]
    const membresias = [
      { id: 'm1', accountId: 'a1', personId: 'kid1', startedOn: '2026-01-01', endedOn: null, sport: 'rugby' },
    ]
    const r = generarCargosDelMes('2026-07', config, membresias, planes)
    expect(r.cargos[0]!.amountCents).toBe(5000000)
  })

  it('no_cobrar en alta a mitad de mes omite el cargo', () => {
    const planes = [plan('p-rugby', 6500000, '2026-01-01')]
    const membresias = [
      { id: 'm1', accountId: 'a1', personId: 'kid1', startedOn: '2026-07-15', endedOn: null, sport: 'rugby' },
    ]
    const r = generarCargosDelMes('2026-07', { ...config, prorrateoParcial: 'no_cobrar' }, membresias, planes)
    expect(r.cargos).toHaveLength(0)
    expect(r.omitidos).toEqual([{ membershipId: 'm1', motivo: 'no_cobrar' }])
  })

  it('membresía sin plan vigente en el período → omitida con motivo', () => {
    const r = generarCargosDelMes('2026-07', config, [{ id: 'm1', accountId: 'a1', personId: 'p1', startedOn: '2026-01-01', endedOn: null, sport: 'rugby' }], [])
    expect(r.cargos).toHaveLength(0)
    expect(r.omitidos).toEqual([{ membershipId: 'm1', motivo: 'sin_plan_vigente' }])
  })

  it('es idempotente: mismo input, mismos cargos', () => {
    const planes = [plan('p-rugby', 6500000, '2026-01-01')]
    const membresias = [
      { id: 'm1', accountId: 'a1', personId: 'kid1', startedOn: '2026-01-01', endedOn: null, sport: 'rugby' },
    ]
    const a = generarCargosDelMes('2026-07', config, membresias, planes)
    const b = generarCargosDelMes('2026-07', config, membresias, planes)
    expect(b).toEqual(a)
  })
})

describe('M3.3 cuenta corriente', () => {
  it('saldoDesdeMovimientos: débito suma deuda, crédito la baja', () => {
    const movs = [
      { direction: 'debito' as const, amountCents: 6500000 },
      { direction: 'debito' as const, amountCents: 5200000 },
      { direction: 'credito' as const, amountCents: 1000000 },
    ]
    expect(saldoDesdeMovimientos(movs)).toBe(10700000)
  })

  it('saldoDesdeMovimientos: cuenta saldada da cero', () => {
    const movs = [
      { direction: 'debito' as const, amountCents: 6500000 },
      { direction: 'credito' as const, amountCents: 6500000 },
    ]
    expect(saldoDesdeMovimientos(movs)).toBe(0)
  })

  it('validarMotivo exige mínimo de caracteres y recorta espacios', () => {
    expect(validarMotivo('   ')).toContain('obligatorio')
    expect(validarMotivo('ok')).toContain('obligatorio')
    expect(validarMotivo('error de carga')).toBeNull()
  })
})
