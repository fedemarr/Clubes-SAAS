import { and, eq, inArray } from 'drizzle-orm'
import type { Tx } from '@/db/tenant'
import { persons, relationships } from '@/db/schema'
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

/** Un menor de 18 años se considera según la fecha de hoy (regla de convocatoria del brief). */
export function esMenor(bornOn: string | null, hoy: Date = new Date()): boolean {
  if (!bornOn) return false
  const nacimiento = new Date(bornOn)
  const edad = hoy.getFullYear() - nacimiento.getFullYear()
  const cumpleAniosEsteAnio = new Date(hoy.getFullYear(), nacimiento.getMonth(), nacimiento.getDate())
  const edadActual = hoy >= cumpleAniosEsteAnio ? edad : edad - 1
  return edadActual < 18
}

/**
 * A quién le llega la convocatoria (regla del brief): los menores reciben
 * el aviso a través de su tutor (vínculo `tutor_de`), nunca al menor;
 * los mayores de 18 lo reciben ellos mismos. Devuelve userIds únicos
 * (solo los que tienen usuario — el resto no puede ser notificado todavía).
 */
export async function resolverDestinatariosConvocatoria(tx: Tx, clubId: string, personIds: string[]): Promise<string[]> {
  const hoy = new Date()
  const personas = await tx
    .select({ id: persons.id, bornOn: persons.bornOn, userId: persons.userId })
    .from(persons)
    .where(and(eq(persons.clubId, clubId), inArray(persons.id, personIds)))

  const menores = personas.filter((p) => esMenor(p.bornOn, hoy))
  const mayores = personas.filter((p) => !esMenor(p.bornOn, hoy))

  const destinatarios = mayores.map((p) => p.userId).filter(Boolean) as string[]

  if (menores.length > 0) {
    const tutores = await tx
      .select({ userId: persons.userId })
      .from(relationships)
      .innerJoin(persons, eq(persons.id, relationships.personId))
      .where(
        and(
          eq(relationships.clubId, clubId),
          eq(relationships.kind, 'tutor_de'),
          inArray(relationships.relatedPersonId, menores.map((p) => p.id)),
        ),
      )
    destinatarios.push(...tutores.map((t) => t.userId).filter((u): u is string => Boolean(u)))
  }

  return [...new Set(destinatarios)]
}
