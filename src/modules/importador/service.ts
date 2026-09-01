import { sql } from 'drizzle-orm'
import { personStatus, persons, teams } from '@/db/schema'
import type { Tx } from '@/db/tenant'
import { CAMPOS_POR_TIPO, type CampoImportacion, type TipoCampo, type TipoImportacion } from './schemas'

type PersonStatus = (typeof personStatus.enumValues)[number]

/**
 * Core del importador (M10): normalización de celdas, validación por fila con
 * dedupe (dentro del archivo y contra la base), y persistencia.

 * Las filas llegan desde el cliente ya mapeadas a campos (Record<campo, celda
 * cruda>); acá se tipan y se descartan/omiten las inválidas y duplicadas.
 */

// ---------------------------------------------------------------------------
// Normalización de celdas
// ---------------------------------------------------------------------------

export function estaVacia(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim().length === 0)
}

export function normalizarTexto(v: unknown): string | null {
  if (estaVacia(v)) return null
  return String(v).trim()
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function coerceCampo(tipo: TipoCampo, raw: unknown): { ok: true; value: string | number } | { ok: false; reason: string } {
  switch (tipo) {
    case 'texto': {
      const s = normalizarTexto(raw)
      return s ? { ok: true, value: s } : { ok: false, reason: 'está vacío' }
    }
    case 'email': {
      const s = normalizarTexto(raw)
      if (!s) return { ok: false, reason: 'está vacío' }
      return EMAIL_RE.test(s) ? { ok: true, value: s.toLowerCase() } : { ok: false, reason: 'no parece un email' }
    }
    case 'fecha': {
      const iso = normalizarFecha(raw)
      return iso ? { ok: true, value: iso } : { ok: false, reason: 'no es una fecha válida (usá dd/mm/aaaa o aaaa-mm-dd)' }
    }
    case 'entero': {
      const n = normalizarEntero(raw)
      return n === null ? { ok: false, reason: 'no es un número entero' } : { ok: true, value: n }
    }
    case 'estado': {
      const e = normalizarEstado(raw)
      return e ? { ok: true, value: e } : { ok: false, reason: 'no es un estado válido (activo, pendiente, inactivo o baja)' }
    }
  }
}

/** Acepta Date, número (serial de Excel) o strings dd/mm/aaaa y aaaa-mm-dd. */
export function normalizarFecha(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10)
  if (typeof v === 'number' && Number.isFinite(v) && v >= 20000 && v <= 70000) {
    const ms = Math.round((v - 25569) * 86_400_000)
    const d = new Date(ms)
    if (!Number.isNaN(d.getTime()) && d.getUTCFullYear() >= 1900 && d.getUTCFullYear() <= 2200) {
      return d.toISOString().slice(0, 10)
    }
    return null
  }
  if (estaVacia(v)) return null
  const s = String(v).trim()
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/) ?? s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return null
  const [, a, b, c] = m
  const y = /^\d{4}/.test(s) ? a : c
  const mo = /^\d{4}/.test(s) ? b : b
  const d = /^\d{4}/.test(s) ? c : a
  if (y.length !== 4) return null
  const iso = `${y}-${mo.length === 1 ? `0${mo}` : mo}-${d.length === 1 ? `0${d}` : d}`
  if (Number.isNaN(new Date(iso).getTime())) return null
  return iso
}

export function normalizarEntero(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v)
  if (estaVacia(v)) return null
  const s = String(v).trim().replace(/[^\d-]/g, '')
  if (!/^-?\d+$/.test(s)) return null
  const n = Number(s)
  return Number.isSafeInteger(n) ? n : null
}

export function normalizarEstado(v: unknown): string | null {
  const t = normalizarTexto(v)
  if (!t) return null
  switch (t.toLowerCase().replace(/[\s.\-]+/g, '')) {
    case 'activo':
      return 'activo'
    case 'pendiente':
    case 'pendienteaprobacion':
    case 'pendaprobacion':
    case 'enaprobacion':
      return 'pendiente_aprobacion'
    case 'inactivo':
      return 'inactivo'
    case 'baja':
    case 'dado debaja':
      return 'baja'
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Tipado + validación de filas
// ---------------------------------------------------------------------------

export type FilaCruda = { index: number; data: Record<string, unknown> }

export type FilaResultado = {
  index: number
  estado: 'ok' | 'error' | 'duplicada'
  errores: string[]
  values: Record<string, unknown>
}

export function tiparFila(campos: CampoImportacion[], data: Record<string, unknown>): { values: Record<string, unknown>; errores: string[] } {
  const values: Record<string, unknown> = {}
  const errores: string[] = []
  for (const campo of campos) {
    const raw = data[campo.key]
    if (estaVacia(raw)) {
      if (campo.required) errores.push(`Falta "${campo.label}"`)
      continue
    }
    const c = coerceCampo(campo.tipo, raw)
    if (!c.ok) {
      errores.push(`"${campo.label}" ${c.reason}`)
      continue
    }
    values[campo.key] = c.value
  }
  return { values, errores }
}

export type DedupeSets = {
  documentos?: Set<string>
  socios?: Set<string>
  equipos?: Set<string>
}

function claveDedupe(tipo: TipoImportacion, values: Record<string, unknown>): string[] {
  if (tipo === 'personas') {
    const claves: string[] = []
    const doc = normalizarTexto(values.docNumber)
    if (doc) claves.push(`d|${doc.toLowerCase()}`)
    const socio = values.memberNumber
    if (socio !== undefined && socio !== null) claves.push(`s|${String(socio)}`)
    return claves
  }
  const sport = normalizarTexto(values.sport)
  const label = normalizarTexto(values.label)
  const season = values.season
  if (sport && label && season !== undefined && season !== null) {
    return [`e|${sport.toLowerCase()}|${label.toLowerCase()}|${String(season)}`]
  }
  return []
}

export function validarMasDedupe(tipo: TipoImportacion, filas: FilaCruda[], sets: DedupeSets): FilaResultado[] {
  const campos = CAMPOS_POR_TIPO[tipo].campos
  const visto = new Set<string>()
  return filas.map((f) => {
    const { values, errores } = tiparFila(campos, f.data)
    const claves = claveDedupe(tipo, values)
    let estado: FilaResultado['estado'] = 'ok'
    if (errores.length > 0) {
      estado = 'error'
    } else if (claves.some((k) => visto.has(k) || yaExiste(tipo, k, sets))) {
      estado = 'duplicada'
    }
    for (const k of claves) visto.add(k)
    return { index: f.index, estado, errores, values }
  })
}

function yaExiste(tipo: TipoImportacion, clave: string, sets: DedupeSets): boolean {
  if (tipo === 'categorias') return sets.equipos?.has(clave) ?? false
  const set = clave.startsWith('d|') ? sets.documentos : sets.socios
  return set?.has(clave) ?? false
}

// ---------------------------------------------------------------------------
// Carga de dedupe contra la base (dentro del withTenant)
// ---------------------------------------------------------------------------

export async function cargarDedupeSets(tx: Tx, clubId: string, tipo: TipoImportacion): Promise<DedupeSets> {
  const sets: DedupeSets = {}
  if (tipo === 'personas') {
    const { rows } = await tx.execute<{ doc_number: string | null; member_number: number | null }>(sql`
      SELECT doc_number, member_number FROM persons
      WHERE club_id = ${clubId} AND deleted_at IS NULL
        AND (doc_number IS NOT NULL OR member_number IS NOT NULL)
    `)
    sets.documentos = new Set()
    sets.socios = new Set()
    for (const r of rows) {
      if (r.doc_number) sets.documentos.add(r.doc_number.toLowerCase())
      if (r.member_number !== null && r.member_number !== undefined) sets.socios.add(String(r.member_number))
    }
  } else {
    const { rows } = await tx.execute<{ sport: string; label: string; season: number }>(sql`
      SELECT sport, label, season FROM teams
      WHERE club_id = ${clubId} AND deleted_at IS NULL
    `)
    sets.equipos = new Set(rows.map((r) => `e|${r.sport.toLowerCase()}|${r.label.toLowerCase()}|${String(r.season)}`))
  }
  return sets
}

// ---------------------------------------------------------------------------
// Persistencia (bulk upsert con ON CONFLICT DO NOTHING + RETURNING)
// ---------------------------------------------------------------------------

export type ResultadoInsercion = { importados: number; filas: FilaResultado[] }

/**
 * Inserta las filas ok dentro de la tx actual. Devuelve la cantidad real
 * insertada (RETURNING solo trae las filas que no chocaron contra el índice
 * único). persons/teams insertan con ON CONFLICT DO NOTHING: la dedupe ya se
 * hizo sobre sets frescos, el DO NOTHING es red de seguridad ante la carrera.
 */
export async function insertarFilas(tx: Tx, clubId: string, tipo: TipoImportacion, filas: FilaResultado[]): Promise<{ importados: number; totalOk: number }> {
  const okRows = filas.filter((f) => f.estado === 'ok')
  const totalOk = okRows.length
  if (totalOk === 0) return { importados: 0, totalOk }

  if (tipo === 'personas') {
    const insertados = await tx
      .insert(persons)
      .values(
        okRows.map((f) => ({
          clubId,
          firstName: String(f.values.firstName).slice(0, 80),
          lastName: String(f.values.lastName).slice(0, 80),
          docType: 'DNI',
          docNumber: f.values.docNumber != null ? String(f.values.docNumber).slice(0, 20) : null,
          bornOn: typeof f.values.bornOn === 'string' ? f.values.bornOn : null,
          email: typeof f.values.email === 'string' ? f.values.email.slice(0, 255) : null,
          phone: typeof f.values.phone === 'string' ? f.values.phone.slice(0, 40) : null,
          memberNumber: typeof f.values.memberNumber === 'number' ? f.values.memberNumber : null,
          status: ((f.values.status as string) ?? 'activo') as PersonStatus,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: persons.id })
    return { importados: insertados.length, totalOk }
  }

  const insertados = await tx
    .insert(teams)
    .values(
      okRows.map((f) => ({
        clubId,
        sport: String(f.values.sport).slice(0, 40),
        label: String(f.values.label).slice(0, 60),
        season: Number(f.values.season),
        birthYearFrom: typeof f.values.birthYearFrom === 'number' ? f.values.birthYearFrom : null,
        birthYearTo: typeof f.values.birthYearTo === 'number' ? f.values.birthYearTo : null,
        isActive: true,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: teams.id })
  return { importados: insertados.length, totalOk }
}