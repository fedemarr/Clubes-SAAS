import { and, eq, sql } from 'drizzle-orm'
import type { Tx } from '@/db/tenant'
import { persons, relationships } from '@/db/schema'

/**
 * Sin fecha de nacimiento no se puede determinar la edad: se asume mayor
 * (no bloquea la activación). Requerir bornOn para poder marcar "activo"
 * es una validación de UI/formulario, no una regla de negocio de esta
 * función.
 */
export function esMenorDeEdad(bornOn: string | null | undefined, hoy: Date = new Date()): boolean {
  if (!bornOn) return false
  const nacimiento = new Date(bornOn)
  let edad = hoy.getFullYear() - nacimiento.getFullYear()
  const noCumplioAun =
    hoy.getMonth() < nacimiento.getMonth() ||
    (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() < nacimiento.getDate())
  if (noCumplioAun) edad -= 1
  return edad < 18
}

export type PuedeEstarActivoResult = { ok: true } | { ok: false; error: string }

/**
 * Un menor de 18 requiere al menos un tutor_de vigente para pasar/quedar
 * `activo` (sección 8, M1, criterios de aceptación). Se evalúa en cada
 * transición hacia `activo`, no solo en el alta.
 */
export function puedeEstarActivo(
  input: { bornOn?: string | null; status: string },
  tutoresVigentes: number,
): PuedeEstarActivoResult {
  if (input.status !== 'activo') return { ok: true }
  if (esMenorDeEdad(input.bornOn) && tutoresVigentes === 0) {
    return { ok: false, error: 'Es menor de edad y no tiene ningún tutor vigente: no puede quedar activo.' }
  }
  return { ok: true }
}

/** Cuenta los tutor_de vigentes que apuntan a personId (sin fecha de fin en la relación: no hay vigencia en `relationships`, existir ya cuenta). */
export async function contarTutoresVigentes(tx: Tx, clubId: string, personId: string): Promise<number> {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(relationships)
    .where(and(eq(relationships.clubId, clubId), eq(relationships.relatedPersonId, personId), eq(relationships.kind, 'tutor_de')))
  return row?.count ?? 0
}

/**
 * Siguiente número de socio libre del club. No hay locking explícito más
 * allá del índice único `persons_club_member_no_uq`: bajo alta
 * concurrencia real esto podría chocar y requerir reintento, aceptable
 * para el volumen de un ABM manual (no es la importación masiva).
 */
export async function siguienteNumeroSocio(tx: Tx, clubId: string): Promise<number> {
  const [row] = await tx
    .select({ max: sql<number | null>`max(${persons.memberNumber})` })
    .from(persons)
    .where(eq(persons.clubId, clubId))
  return (row?.max ?? 0) + 1
}

/** Roles vigentes de una persona hoy (validTo null o futuro). */
export function rolVigente(validTo: string | null, hoy: string = new Date().toISOString().slice(0, 10)): boolean {
  return validTo === null || validTo >= hoy
}
