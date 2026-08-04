/**
 * Reglas de negocio puras del módulo cuotas (M3), sin dependencias de base.
 * Cada función es testeable sin DB y sin request.
 */

export type PlanVersion = {
  id: string
  validFrom: string
  validTo: string | null
}

/**
 * Plan vigente para una fecha: el de validFrom más reciente dentro de
 * [validFrom, validTo]. El precio viejo nunca se pisa: un ajuste crea una
 * versión nueva, no edita la anterior.
 */
export function planVigente(planes: PlanVersion[], fecha: string): PlanVersion | undefined {
  return planes
    .filter((p) => p.validFrom <= fecha && (!p.validTo || p.validTo >= fecha))
    .sort((a, b) => (a.validFrom < b.validFrom ? 1 : a.validFrom > b.validFrom ? -1 : 0))[0]
}

/**
 * Valida que una nueva versión de precio arranque después de la vigente.
 * Devolver null = ok, string = motivo de rechazo.
 */
export function validarNuevaVersion(existentes: PlanVersion[], validFrom: string): string | null {
  const activos = existentes.filter((p) => !p.validTo)
  if (activos.length === 0) return null
  const ultima = activos.sort((a, b) => (a.validFrom < b.validFrom ? 1 : a.validFrom > b.validFrom ? -1 : 0))[0]
  if (validFrom <= ultima.validFrom) {
    return `Ya existe una versión vigente desde ${ultima.validFrom}. La nueva versión debe arrancar después.`
  }
  return null
}

/**
 * Descuento por hermano, acumulativo. El índice es directo: siblingDiscounts[0]
 * es el 1º hermano (0%), [1] el 2º, [2] el 3º. [0, 20, 40] = 2º hermano 20%,
 * 3º 40%. Fuera del arreglo, cero.
 */
export function descuentosPorHermano(siblingDiscounts: number[] | null, cantidad: number): number[] {
  const arr = siblingDiscounts ?? []
  return Array.from({ length: cantidad }, (_, i) => arr[i] ?? 0)
}

export type PlanParaHermano = {
  planId: string
  amountCents: number
  siblingDiscounts: number[] | null
}

export type MontoHermano = PlanParaHermano & {
  descuentoPct: number
  montoFinalCents: number
}

/**
 * Calcula el monto final de cada miembro de una misma cuenta corriente
 * (grupo familiar). Ordenados por cuota de mayor a menor: el primer plan
 * paga completo y los descuentos acumulativos caen sobre los más baratos.
 * Cada plan aplica su propio arreglo de descuentos por el rango que ocupa.
 */
export function calcularMontosHermanos(planes: PlanParaHermano[]): MontoHermano[] {
  const ordenados = [...planes].sort(
    (a, b) => b.amountCents - a.amountCents || a.planId.localeCompare(b.planId),
  )
  return ordenados.map((p, i) => {
    const arr = p.siblingDiscounts ?? []
    const pct = arr[i] ?? 0
    const monto = Math.round(p.amountCents * (1 - pct / 100))
    return { ...p, descuentoPct: pct, montoFinalCents: monto }
  })
}
