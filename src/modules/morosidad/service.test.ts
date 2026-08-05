import { describe, expect, it } from 'vitest'
import {
  diasDesde,
  enHorarioSilencio,
  evaluarReglasCobranza,
  mesesEntre,
  planDePago,
  renderizarPlantilla,
  sumarMeses,
  tramoAntiguedad,
} from './service'
import type { DeudorCobranza, ReglaCobranza } from './service'

describe('tramoAntiguedad', () => {
  it('1 = menos de un mes, 2 = un mes, 3 = dos meses, 4 = tres o más', () => {
    expect(tramoAntiguedad(0)).toBe(1)
    expect(tramoAntiguedad(1)).toBe(2)
    expect(tramoAntiguedad(2)).toBe(3)
    expect(tramoAntiguedad(3)).toBe(4)
    expect(tramoAntiguedad(8)).toBe(4)
  })
})

describe('mesesEntre y diasDesde', () => {
  it('calcula meses y días desde un vencimiento', () => {
    const hoy = new Date(2026, 7, 5) // 5 de agosto de 2026
    expect(mesesEntre('2026-08-01', hoy)).toBe(0)
    expect(mesesEntre('2026-06-01', hoy)).toBe(2)
    expect(diasDesde('2026-07-31', hoy)).toBe(5)
    expect(diasDesde('2026-08-10', hoy)).toBe(0)
  })
})

describe('enHorarioSilencio', () => {
  it('antes de las 9 es silencio', () => {
    expect(enHorarioSilencio(new Date(2026, 7, 5, 8, 59), 'America/Argentina/Buenos_Aires')).toBe(true)
  })
  it('a las 9 en punto no es silencio', () => {
    expect(enHorarioSilencio(new Date(2026, 7, 5, 9, 0), 'America/Argentina/Buenos_Aires')).toBe(false)
  })
  it('a las 21 es silencio', () => {
    expect(enHorarioSilencio(new Date(2026, 7, 5, 21, 0), 'America/Argentina/Buenos_Aires')).toBe(true)
  })
  it('a las 15 no es silencio', () => {
    expect(enHorarioSilencio(new Date(2026, 7, 5, 15, 30), 'America/Argentina/Buenos_Aires')).toBe(false)
  })
})

describe('renderizarPlantilla', () => {
  it('reemplaza variables y deja intactas las que faltan', () => {
    const body = 'Hola {{nombre}}, debés {{monto}}. Pagá: {{link_pago}}'
    expect(renderizarPlantilla(body, { nombre: 'Juan', monto: '$65.000', link_pago: 'https://x' })).toBe(
      'Hola Juan, debés $65.000. Pagá: https://x',
    )
    expect(renderizarPlantilla('Hola {{faltante}}', {})).toBe('Hola {{faltante}}')
  })
})

describe('evaluarReglasCobranza', () => {
  const deudor = (accountId: string, dias: number, destino: DeudorCobranza['destino'] = null): DeudorCobranza => ({
    accountId,
    deudaCents: 6500000,
    diasDesdeVencimiento: dias,
    destino,
  })

  const regla = (over: Partial<ReglaCobranza> = {}): ReglaCobranza => ({
    id: 'r1',
    name: 'Recordatorio amable',
    dias: 5,
    channel: 'whatsapp',
    templateKey: 'recordatorio',
    dedupeDias: 7,
    enabled: true,
    ...over,
  })

  const ahora = new Date(2026, 7, 5, 15, 0) // día hábil, 15:00, fuera de silencio

  it('dispara solo cuando se cumple el día desde el vencimiento', () => {
    const r = evaluarReglasCobranza({
      deudores: [deudor('a', 3, { userId: 'u1', nombre: 'Juan', apellido: 'Pérez' })],
      reglas: [regla()],
      plantillas: { recordatorio: 'Hola {{nombre}}' },
      contactosRecientes: [],
      ahora,
    })
    expect(r.disparos).toHaveLength(0)

    const r2 = evaluarReglasCobranza({
      deudores: [deudor('a', 5, { userId: 'u1', nombre: 'Juan', apellido: 'Pérez' })],
      reglas: [regla()],
      plantillas: { recordatorio: 'Hola {{nombre}}' },
      contactosRecientes: [],
      ahora,
    })
    expect(r2.disparos).toHaveLength(1)
    expect(r2.disparos[0]).toMatchObject({ accountId: 'a', ruleId: 'r1', channel: 'whatsapp', kind: 'mensaje', destinoUserId: 'u1' })
  })

  it('no manda en horario de silencio', () => {
    const r = evaluarReglasCobranza({
      deudores: [deudor('a', 6, { userId: 'u1', nombre: 'Juan', apellido: 'Pérez' })],
      reglas: [regla()],
      plantillas: { recordatorio: 'Hola' },
      contactosRecientes: [],
      ahora: new Date(2026, 7, 5, 22, 0),
    })
    expect(r.disparos).toHaveLength(0)
    expect(r.omitidos[0]?.motivo).toBe('silencio nocturno')
  })

  it('no manda sin destinatario pagador', () => {
    const r = evaluarReglasCobranza({
      deudores: [deudor('a', 6, null)],
      reglas: [regla()],
      plantillas: { recordatorio: 'Hola' },
      contactosRecientes: [],
      ahora,
    })
    expect(r.disparos).toHaveLength(0)
    expect(r.omitidos[0]?.motivo).toBe('sin destinatario pagador')
  })

  it('no manda si falta la plantilla', () => {
    const r = evaluarReglasCobranza({
      deudores: [deudor('a', 6, { userId: 'u1', nombre: 'Juan', apellido: 'Pérez' })],
      reglas: [regla()],
      plantillas: {},
      contactosRecientes: [],
      ahora,
    })
    expect(r.disparos).toHaveLength(0)
    expect(r.omitidos[0]?.motivo).toBe('sin plantilla')
  })

  it('máximo un mensaje por cuenta por semana sin importar la regla', () => {
    const ayer = new Date(ahora.getTime() - 86400000)
    const r = evaluarReglasCobranza({
      deudores: [deudor('a', 6, { userId: 'u1', nombre: 'Juan', apellido: 'Pérez' })],
      reglas: [
        regla({ id: 'r1', templateKey: 't1' }),
        regla({ id: 'r2', channel: 'mail', templateKey: 't1' }),
      ],
      plantillas: { t1: 'Hola' },
      contactosRecientes: [{ accountId: 'a', ruleId: 'r1', channel: 'whatsapp', deliveredAt: ayer }],
      ahora,
    })
    expect(r.disparos).toHaveLength(0)
    expect(r.omitidos).toHaveLength(2)
  })

  it('la dedupe vence después de la ventana', () => {
    const hace8dias = new Date(ahora.getTime() - 8 * 86400000)
    const r = evaluarReglasCobranza({
      deudores: [deudor('a', 6, { userId: 'u1', nombre: 'Juan', apellido: 'Pérez' })],
      reglas: [regla()],
      plantillas: { recordatorio: 'Hola' },
      contactosRecientes: [{ accountId: 'a', ruleId: 'r1', channel: 'whatsapp', deliveredAt: hace8dias }],
      ahora,
    })
    expect(r.disparos).toHaveLength(1)
  })

  it('coordinador y suspensión deduplican por su propia regla, no por los mensajes', () => {
    const ayer = new Date(ahora.getTime() - 86400000)
    const r = evaluarReglasCobranza({
      deudores: [deudor('a', 60, { userId: 'u1', nombre: 'Juan', apellido: 'Pérez' })],
      reglas: [
        regla({ id: 'rs', dias: 60, channel: 'suspension', templateKey: null }),
        regla({ id: 'rc', dias: 45, channel: 'coordinador', templateKey: null }),
      ],
      plantillas: {},
      // Hubo un mensaje de whatsapp ayer: no bloquea avisos/sugerencias.
      contactosRecientes: [{ accountId: 'a', ruleId: 'r1', channel: 'whatsapp', deliveredAt: ayer }],
      ahora,
    })
    expect(r.disparos.map((d) => d.kind)).toEqual(['sugerencia', 'aviso'])
    expect(r.disparos[0]).toMatchObject({ accountId: 'a', ruleId: 'rs', channel: 'suspension', body: null })
  })

  it('suspensión deduplicada por su propia regla dentro de la ventana', () => {
    const ayer = new Date(ahora.getTime() - 86400000)
    const r = evaluarReglasCobranza({
      deudores: [deudor('a', 60, null)],
      reglas: [regla({ id: 'rs', dias: 60, channel: 'suspension', templateKey: null })],
      plantillas: {},
      contactosRecientes: [{ accountId: 'a', ruleId: 'rs', channel: 'suspension', deliveredAt: ayer }],
      ahora,
    })
    expect(r.disparos).toHaveLength(0)
    expect(r.omitidos[0]?.motivo).toBe('ya contactado')
  })

  it('las reglas deshabilitadas no disparan', () => {
    const r = evaluarReglasCobranza({
      deudores: [deudor('a', 6, { userId: 'u1', nombre: 'Juan', apellido: 'Pérez' })],
      reglas: [regla({ enabled: false })],
      plantillas: { recordatorio: 'Hola' },
      contactosRecientes: [],
      ahora,
    })
    expect(r.disparos).toHaveLength(0)
  })

  it('pasa las variables al render de la plantilla', () => {
    const r = evaluarReglasCobranza({
      deudores: [deudor('a', 6, { userId: 'u1', nombre: 'Juan', apellido: 'Pérez' })],
      reglas: [regla()],
      plantillas: { recordatorio: 'Hola {{nombre}}, debés {{monto}}' },
      contactosRecientes: [],
      ahora,
      varsDeudor: (d) => ({ nombre: d.destino?.nombre ?? '', monto: `$ ${d.deudaCents / 100}` }),
    })
    expect(r.disparos[0]?.body).toBe('Hola Juan, debés $ 65000')
  })
})

describe('sumarMeses y planDePago', () => {
  it('suma meses conservando el día', () => {
    expect(sumarMeses('2026-08-05', 1)).toBe('2026-09-05')
    expect(sumarMeses('2026-01-31', 1)).toBe('2026-02-28')
    expect(sumarMeses('2024-01-31', 1)).toBe('2024-02-29')
  })

  it('divide la deuda en cuotas exactas repartiendo el resto de a un centavo', () => {
    const plan = planDePago(6500001, 3, '2026-08-05')
    expect(plan).toHaveLength(3)
    expect(plan[0].montoCents).toBe(2166667)
    expect(plan[1].montoCents).toBe(2166667)
    expect(plan[2].montoCents).toBe(2166667)
    expect(plan.reduce((acc, c) => acc + c.montoCents, 0)).toBe(6500001)
    expect(plan[1].fecha).toBe('2026-09-05')
    expect(plan[2].fecha).toBe('2026-10-05')
  })

  it('devuelve vacío sin deuda o sin cuotas', () => {
    expect(planDePago(0, 3, '2026-08-05')).toEqual([])
    expect(planDePago(65000, 0, '2026-08-05')).toEqual([])
  })
})
