import type { eventKind } from '@/db/schema'

export const RECURRENCIA_MAX_SEMANAS = 52

export type EventoDatos = {
  kind: (typeof eventKind.enumValues)[number]
  startsAt: string
  endsAt?: string
  recurrenciaSemanalHasta?: string
}

export type EventoFilasResult =
  | { ok: true; filas: { startsAt: Date; endsAt: Date; meta: Record<string, unknown> | null }[] }
  | { ok: false; error: string }

export function expandirOcurrenciasSemana(desde: Date, hasta: Date): Date[] {
  const ocurrencias: Date[] = []
  const actual = new Date(desde)
  while (actual <= hasta && ocurrencias.length < RECURRENCIA_MAX_SEMANAS) {
    ocurrencias.push(new Date(actual))
    actual.setDate(actual.getDate() + 7)
  }
  return ocurrencias
}

export function construirFilasEvento(input: EventoDatos): EventoFilasResult {
  const startsAt = new Date(input.startsAt)
  const durationMs = input.endsAt
    ? new Date(input.endsAt).getTime() - startsAt.getTime()
    : 60 * 60 * 1000

  if (durationMs <= 0) {
    return { ok: false, error: 'La hora de fin debe ser posterior a la de inicio.' }
  }

  if (!input.recurrenciaSemanalHasta) {
    const endsAt = new Date(startsAt.getTime() + durationMs)
    return { ok: true, filas: [{ startsAt, endsAt, meta: null }] }
  }

  if (input.kind !== 'entrenamiento') {
    return { ok: false, error: 'La recurrencia semanal solo está disponible para entrenamientos.' }
  }

  const hasta = new Date(input.recurrenciaSemanalHasta + 'T23:59:59Z')
  if (hasta < startsAt) {
    return { ok: false, error: 'La fecha de fin de recurrencia debe ser posterior a la fecha del entrenamiento.' }
  }

  const ocurrencias = expandirOcurrenciasSemana(startsAt, hasta)
  if (ocurrencias.length === 0) {
    return { ok: false, error: 'El período de recurrencia no genera ningún entrenamiento.' }
  }
  if (ocurrencias.length >= RECURRENCIA_MAX_SEMANAS) {
    return { ok: false, error: `El período de recurrencia supera el máximo de ${RECURRENCIA_MAX_SEMANAS} semanas.` }
  }

  const filas = ocurrencias.map((fecha, i) => ({
    startsAt: fecha,
    endsAt: new Date(fecha.getTime() + durationMs),
    meta: { recurrencia: { orden: i + 1 } } as Record<string, unknown>,
  }))

  return { ok: true, filas }
}
