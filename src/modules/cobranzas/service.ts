/**
 * Reglas de negocio puras del módulo cobranzas (M4), sin dependencias de base.
 * La regla central: la imputación de un pago a cargos es FIFO por vencimiento
 * (brief M4), salvo imputación manual explícita.
 */

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
