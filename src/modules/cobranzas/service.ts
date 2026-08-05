/**
 * Reglas de negocio puras del módulo cobranzas (M4), sin dependencias de base.
 * La regla central: la imputación de un pago a cargos es FIFO por vencimiento
 * (brief M4), salvo imputación manual explícita.
 */
import { centsToDecimal } from '@/lib/money'

export type CargoAbiertoImputable = {
  id: string
  dueOn: string
  /** Saldo = amount - pagado. Un cargo con saldo 0 no recibe nada. */
  saldoCents: number
}

export type Imputacion = {
  chargeId: string
  amountCents: number
}

export type MetodoPago = 'efectivo' | 'transferencia' | 'debito_automatico' | 'mercado_pago' | 'tarjeta'

export type ResultadoImputacion = {
  imputaciones: Imputacion[]
  /** Excedente que queda "a cuenta" de la familia cuando paga de más. */
  sobranteCents: number
}

/**
 * Imputación FIFO por vencimiento (y, para empates, por id para estabilidad).
 * Recorre los cargos abiertos de menor a mayor vencimiento y aplica el monto
 * hasta agotarlo. Lo que sobra vuelve como excedente "a cuenta".
 */
export function imputarPagoFIFO(
  cargos: CargoAbiertoImputable[],
  montoCents: number,
): ResultadoImputacion {
  const ordenados = [...cargos].sort(
    (a, b) => a.dueOn.localeCompare(b.dueOn) || a.id.localeCompare(b.id),
  )
  let restante = montoCents
  const imputaciones: Imputacion[] = []
  for (const c of ordenados) {
    if (restante <= 0) break
    const aplicado = Math.min(restante, c.saldoCents)
    if (aplicado <= 0) continue
    imputaciones.push({ chargeId: c.id, amountCents: aplicado })
    restante -= aplicado
  }
  return { imputaciones, sobranteCents: restante }
}

/**
 * Estado de un cargo después de una imputación: pagado si el acumulado
 * alcanza el total, parcial si no, pendiente si no recibió nada.
 */
export function estadoCargoDespuesDePago(amountCents: number, pagadoCents: number): 'pagado' | 'parcial' | 'pendiente' {
  if (pagadoCents >= amountCents) return 'pagado'
  if (pagadoCents > 0) return 'parcial'
  return 'pendiente'
}

/**
 * "65.000,50", "65000", "65000.5" → 6500050 centavos. Entrada del cobrador:
 * se escribe en pesos, se guarda en centavos. Nunca float en el medio.
 */
export function parsearPesosACentavos(texto: string): number {
  const t = texto.trim()
  if (!t) return 0
  let intPart = t
  let decPart = ''
  if (t.includes(',')) {
    const [i, d] = t.split(',')
    intPart = i.replace(/\./g, '').replace(/\D/g, '')
    decPart = d.replace(/\D/g, '').slice(0, 2)
  } else if (t.includes('.')) {
    const parts = t.split('.')
    decPart = (parts.pop() ?? '').replace(/\D/g, '').slice(0, 2)
    intPart = parts.join('').replace(/\D/g, '')
  } else {
    intPart = t.replace(/\D/g, '')
  }
  const int = parseInt(intPart || '0', 10)
  const dec = parseInt(decPart.padEnd(2, '0') || '0', 10)
  return int * 100 + dec
}

/**
 * Igual que parsearPesosACentavos pero respetando el signo (extractos
 * bancarios). Devuelve centavos negativos para montos de egreso.
 */
export function parsearMontoCelda(texto: string): number {
  const t = texto.trim()
  const negativo = t.startsWith('-')
  const monto = parsearPesosACentavos(t.replace(/^[-+]/, ''))
  return negativo ? -monto : monto
}

export type MovimientoExtracto = {
  fecha: string
  montoCents: number
  detalle: string
}

const FECHA_RE = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/
const FECHA_ISO_RE = /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/

/** Normaliza "5/8/2026" o "2026-08-05" a "2026-08-05". */
export function normalizarFecha(texto: string): string | null {
  const iso = texto.match(FECHA_ISO_RE)
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  }
  const m = texto.match(FECHA_RE)
  if (!m) return null
  const anio = m[3].length === 2 ? String((Number(m[3]) <= 90 ? 2000 : 1900) + Number(m[3])) : m[3]
  return `${anio}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

/**
 * Parseo genérico de un extracto CSV bancario. Detecta las columnas de
 * fecha y monto por su forma; el resto va al detalle. Los movimientos sin
 * fecha o sin monto (encabezados, totales) se descartan, igual que los
 * egresos (solo se concilian ingresos).
 */
export function parsearExtractoCSV(texto: string, separador = ';'): MovimientoExtracto[] {
  const filas = texto.split(/\r?\n/).filter((l) => l.trim() !== '')
  const resultado: MovimientoExtracto[] = []

  for (const linea of filas) {
    const celdas = linea.split(separador).map((c) => c.trim().replace(/^"(.*)"$/, '$1'))
    let fecha: string | null = null
    let montoCents: number | null = null
    let idxMonto = -1

    for (let i = 0; i < celdas.length; i++) {
      if (!fecha && FECHA_RE.test(celdas[i])) fecha = normalizarFecha(celdas[i])
      if (idxMonto < 0 && /^[+\-]?[\d.,]+$/.test(celdas[i])) {
        const monto = parsearMontoCelda(celdas[i])
        if (monto !== 0) {
          montoCents = monto
          idxMonto = i
        }
      }
    }

    if (!fecha || montoCents === null || montoCents < 0) continue
    const detalle = celdas
      .filter((_, i) => i !== idxMonto && !FECHA_RE.test(celdas[i]))
      .join(' ')
      .trim()
    resultado.push({ fecha, montoCents, detalle })
  }
  return resultado
}

/** Normaliza para comparar nombres: minúsculas, sin acentos, solo alfanuméricos. */
export function normalizarNombre(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0)
}

/**
 * Similitud entre el detalle del ordenante y el apellido/nombre del titular.
 * 1 = el apellido aparece como token, 0.8 = el nombre, 0.5 = el apellido está
 * contenido en un token más largo, 0 = nada.
 */
export function similitudNombre(detalle: string, apellido: string, nombre: string): number {
  const tokens = normalizarNombre(detalle)
  if (tokens.length === 0) return 0
  const apellidoN = normalizarNombre(apellido)
  const nombreN = normalizarNombre(nombre)
  for (const t of tokens) {
    if (apellidoN.includes(t) || t === apellidoN[0]) return 1
    if (nombreN.includes(t)) return 0.8
  }
  for (const a of apellidoN) {
    if (tokens.some((t) => t.length > 3 && t.includes(a))) return 0.5
  }
  return 0
}

export type DeudorParaMatch = {
  accountId: string
  holderApellido: string
  holderNombre: string
  saldoCents: number
}

export type PropuestaMatch = {
  accountId: string | null
  confianza: 'alta' | 'media' | null
}

/**
 * Propone matcheos extracto ↔ cuentas deudoras: monto exacto + ventana de
 * nombre (brief M4). Con un solo deudor del monto exacto → confianza alta.
 * Con varios → se elige el de mejor similitud de nombre (media) o ninguno.
 */
export function proponerMatcheos(
  movimientos: MovimientoExtracto[],
  deudores: DeudorParaMatch[],
): PropuestaMatch[] {
  const porMonto = new Map<number, DeudorParaMatch[]>()
  for (const d of deudores) {
    const arr = porMonto.get(d.saldoCents) ?? []
    arr.push(d)
    porMonto.set(d.saldoCents, arr)
  }

  return movimientos.map((m) => {
    const candidatos = porMonto.get(m.montoCents) ?? []
    if (candidatos.length === 1) {
      return { accountId: candidatos[0].accountId, confianza: 'alta' }
    }
    if (candidatos.length > 1) {
      let mejor: DeudorParaMatch | null = null
      let mejorScore = 0
      for (const c of candidatos) {
        const score = similitudNombre(m.detalle, c.holderApellido, c.holderNombre)
        if (score > mejorScore) {
          mejorScore = score
          mejor = c
        }
      }
      if (mejor && mejorScore >= 0.6) {
        return { accountId: mejor.accountId, confianza: 'media' }
      }
    }
    return { accountId: null, confianza: null }
  })
}

// ---------------------------------------------------------------------------
// M4.4 · Débito automático. El formato de lote y de rechazos es enchufable:
// cada banco define su propio adaptador en FORMATOS_DEBITO (hoy solo existe el
// CSV genérico). El resto del módulo no sabe qué banco es.
// ---------------------------------------------------------------------------

export const CBU_RE = /^\d{22}$/

export function esCbuValido(cbu: string): boolean {
  return CBU_RE.test(cbu.trim())
}

/**
 * Numera un lote: "D-<año>-<secuencia>". La secuencia arranca en 1 por año
 * y crece solo si el último lote es del mismo año.
 */
export function generarNumeroLote(anio: number, ultimo: string | null): string {
  const re = /^D-(\d{4})-(\d+)$/
  let seq = 1
  if (ultimo) {
    const m = ultimo.match(re)
    if (m && Number(m[1]) === anio) seq = Number(m[2]) + 1
  }
  return `D-${anio}-${String(seq).padStart(3, '0')}`
}

export type RegistroLoteDebito = {
  cbu: string
  titular: string
  montoCents: number
  periodo: string
  /** externalRef del payment: 'debito:<numero>:<accountId>'. El banco lo
   *  devuelve en el archivo de rechazos para matchear sin ambigüedad. */
  referencia: string
}

export function csvEscape(campo: string, separador: string): string {
  if (campo.includes(separador) || campo.includes('"') || campo.includes('\n') || campo.includes('\r')) {
    return `"${campo.replace(/"/g, '""')}"`
  }
  return campo
}

/** Serializa el lote a CSV genérico (separador ';' por defecto, como los
 *  extractos de la conciliación). CRLF y monto con dos decimales. */
export function serializarLoteCSV(registros: RegistroLoteDebito[], separador = ';'): string {
  const cabecera = ['cbu', 'titular', 'monto', 'periodo', 'referencia'].join(separador)
  const lineas = registros.map((r) =>
    [
      r.cbu,
      csvEscape(r.titular, separador),
      centsToDecimal(r.montoCents),
      r.periodo,
      r.referencia,
    ].join(separador),
  )
  return [cabecera, ...lineas].join('\r\n') + '\r\n'
}

export type RechazoDebito = {
  referencia: string | null
  cbu: string | null
  montoCents: number
  codigo: string | null
  motivo: string
}

const REF_DEBITO_RE = /^(debito:[^;]+|D-\d{4}-\d+)$/

/**
 * Parsea el archivo de rechazos del banco (CSV genérico). Detecta por forma:
 * CBU de 22 dígitos, monto numérico y referencia (externalRef del lote); el
 * resto se junta como motivo, y un código numérico al inicio queda aparte.
 */
export function parsearRechazosCSV(texto: string, separador = ';'): RechazoDebito[] {
  const filas = texto.split(/\r?\n/).filter((l) => l.trim() !== '')
  const rechazos: RechazoDebito[] = []

  for (const linea of filas) {
    const celdas = linea.split(separador).map((c) => c.trim().replace(/^"(.*)"$/, '$1'))
    let cbu: string | null = null
    let montoCents: number | null = null
    let referencia: string | null = null
    const resto: string[] = []

    for (const celda of celdas) {
      if (celda === '') continue
      if (!cbu && CBU_RE.test(celda)) {
        cbu = celda
        continue
      }
      if (montoCents === null && /^[+\-]?[\d.,]+$/.test(celda)) {
        const m = parsearMontoCelda(celda)
        if (m !== 0) {
          montoCents = m
          continue
        }
      }
      if (!referencia && REF_DEBITO_RE.test(celda)) {
        referencia = celda
        continue
      }
      resto.push(celda)
    }

    if (montoCents === null && !referencia && !cbu) continue

    let motivo = resto.join(' ').trim()
    let codigo: string | null = null
    const mCod = motivo.match(/^(\d{1,6})\s+(.*)$/)
    if (mCod) {
      codigo = mCod[1]
      motivo = mCod[2]
    }

    rechazos.push({ referencia, cbu, montoCents: montoCents ?? 0, codigo, motivo })
  }

  return rechazos
}
