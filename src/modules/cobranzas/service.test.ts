import { describe, expect, it } from 'vitest'
import {
  estadoCargoDespuesDePago,
  imputarPagoFIFO,
  normalizarFecha,
  parsearExtractoCSV,
  parsearMontoCelda,
  parsearPesosACentavos,
  proponerMatcheos,
  similitudNombre,
} from './service'

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

describe('parsearMontoCelda', () => {
  it('respeta el signo negativo', () => {
    expect(parsearMontoCelda('-5000,00')).toBe(-500000)
  })
  it('ignora el signo positivo explícito', () => {
    expect(parsearMontoCelda('+1234.56')).toBe(123456)
  })
})

describe('normalizarFecha', () => {
  it('normaliza dd/mm/yyyy', () => {
    expect(normalizarFecha('05/08/2026')).toBe('2026-08-05')
    expect(normalizarFecha('5/8/2026')).toBe('2026-08-05')
  })
  it('normaliza yyyy-mm-dd', () => {
    expect(normalizarFecha('2026-08-05')).toBe('2026-08-05')
  })
  it('devuelve null sin fecha', () => {
    expect(normalizarFecha('hola')).toBeNull()
  })
})

describe('parsearExtractoCSV', () => {
  const csv = [
    'Fecha;Monto;Detalle',
    '05/08/2026;65000,00;TRANSFERENCIA JUAN PEREZ',
    '06/08/2026;-12000,00;PAGO SERVICIO',
    '07/08/2026;52000.50;María González',
    'sin datos;35000;RARO',
    '',
  ].join('\n')

  it('extrae los ingresos y descarta encabezado, egresos y filas sin fecha', () => {
    const m = parsearExtractoCSV(csv, ';')
    expect(m).toHaveLength(2)
    expect(m[0]).toEqual({ fecha: '2026-08-05', montoCents: 6500000, detalle: 'TRANSFERENCIA JUAN PEREZ' })
    expect(m[1]).toEqual({ fecha: '2026-08-07', montoCents: 5200050, detalle: 'María González' })
  })
})

describe('similitudNombre', () => {
  it('detecta el apellido como token', () => {
    expect(similitudNombre('TRANSFERENCIA JUAN PEREZ', 'Pérez', 'María')).toBe(1)
  })
  it('detecta el nombre', () => {
    expect(similitudNombre('transferencia maria', 'Pérez', 'María')).toBe(0.8)
  })
  it('sin coincidencia da 0', () => {
    expect(similitudNombre('transferencia genérica', 'Pérez', 'María')).toBe(0)
  })
})

describe('proponerMatcheos', () => {
  const deudores = [
    { accountId: 'a1', holderApellido: 'Pérez', holderNombre: 'Juan', saldoCents: 6500000 },
    { accountId: 'a2', holderApellido: 'Pérez', holderNombre: 'María', saldoCents: 6500000 },
    { accountId: 'a3', holderApellido: 'González', holderNombre: 'María', saldoCents: 5200050 },
  ]

  it('monto exacto con un solo deudor → confianza alta', () => {
    const movs = [{ fecha: '2026-08-05', montoCents: 5200050, detalle: 'whatever' }]
    expect(proponerMatcheos(movs, deudores)).toEqual([{ accountId: 'a3', confianza: 'alta' }])
  })

  it('monto repetido elige por nombre → media', () => {
    const movs = [{ fecha: '2026-08-05', montoCents: 6500000, detalle: 'transferencia JUAN' }]
    expect(proponerMatcheos(movs, deudores)).toEqual([{ accountId: 'a1', confianza: 'media' }])
  })

  it('sin candidato → sin propuesta', () => {
    const movs = [{ fecha: '2026-08-05', montoCents: 999, detalle: 'x' }]
    expect(proponerMatcheos(movs, deudores)).toEqual([{ accountId: null, confianza: null }])
  })
})
