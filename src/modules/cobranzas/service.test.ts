import { describe, expect, it } from 'vitest'
import {
  esCbuValido,
  estadoCargoDespuesDePago,
  generarNumeroLote,
  imputarPagoFIFO,
  normalizarFecha,
  parsearExtractoCSV,
  parsearMontoCelda,
  parsearPesosACentavos,
  parsearRechazosCSV,
  proponerMatcheos,
  serializarLoteCSV,
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

describe('esCbuValido', () => {
  it('acepta 22 dígitos', () => {
    expect(esCbuValido('2850590940090418135201')).toBe(true)
  })
  it('rechaza CBU corto o con letras', () => {
    expect(esCbuValido('1234')).toBe(false)
    expect(esCbuValido('285059094009041813520a')).toBe(false)
    expect(esCbuValido('')).toBe(false)
  })
})

describe('generarNumeroLote', () => {
  it('arranca en 1 por año', () => {
    expect(generarNumeroLote(2026, null)).toBe('D-2026-001')
  })
  it('incrementa cuando el último lote es del mismo año', () => {
    expect(generarNumeroLote(2026, 'D-2026-007')).toBe('D-2026-008')
  })
  it('reinicia la secuencia cuando el último lote es de otro año', () => {
    expect(generarNumeroLote(2026, 'D-2025-099')).toBe('D-2026-001')
  })
  it('ignora un último lote con formato inválido', () => {
    expect(generarNumeroLote(2026, 'basura')).toBe('D-2026-001')
  })
})

describe('serializarLoteCSV', () => {
  const registros = [
    {
      cbu: '2850590940090418135201',
      titular: 'Pérez, Juan',
      montoCents: 6500000,
      periodo: '2026-07',
      referencia: 'debito:D-2026-001:abc-123',
    },
  ]

  it('genera cabecera, monto con dos decimales y CRLF', () => {
    const csv = serializarLoteCSV(registros, ';')
    const lineas = csv.split('\r\n').filter((l) => l !== '')
    expect(lineas[0]).toBe('cbu;titular;monto;periodo;referencia')
    expect(lineas[1]).toBe('2850590940090418135201;Pérez, Juan;65000.00;2026-07;debito:D-2026-001:abc-123')
    expect(csv.endsWith('\r\n')).toBe(true)
  })

  it('escapa comillas en el titular', () => {
    const csv = serializarLoteCSV(
      [{ cbu: '2850590940090418135201', titular: 'Díaz "El Loco"', montoCents: 100, periodo: '2026-07', referencia: 'r' }],
      ';',
    )
    expect(csv).toContain('"Díaz ""El Loco"""')
  })
})

describe('parsearRechazosCSV', () => {
  it('detecta referencia, CBU, monto y motivo', () => {
    const csv = ['debito:D-2026-001:abc-123;2850590940090418135201;65000.00;001;FONDOS INSUFICIENTES'].join('\n')
    const r = parsearRechazosCSV(csv, ';')
    expect(r).toEqual([
      {
        referencia: 'debito:D-2026-001:abc-123',
        cbu: '2850590940090418135201',
        montoCents: 6500000,
        codigo: '001',
        motivo: 'FONDOS INSUFICIENTES',
      },
    ])
  })

  it('acepta el mismo formato del lote (cbu;titular;monto;periodo;referencia)', () => {
    const csv = ['2850590940090418135201;Pérez, Juan;65000.00;2026-07;debito:D-2026-001:abc-123'].join('\n')
    const r = parsearRechazosCSV(csv, ';')
    expect(r[0]).toMatchObject({ cbu: '2850590940090418135201', montoCents: 6500000, referencia: 'debito:D-2026-001:abc-123' })
  })

  it('descarta filas vacías y basura', () => {
    const csv = ['', 'nota sin datos', '   '].join('\n')
    expect(parsearRechazosCSV(csv, ';')).toEqual([])
  })
})
