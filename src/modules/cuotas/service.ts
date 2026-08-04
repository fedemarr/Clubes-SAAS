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
export function planVigente<T extends PlanVersion>(planes: T[], fecha: string): T | undefined {
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
  /** Identidad única dentro del grupo (id de membresía al calcular cargos). */
  key: string
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
 * `key` debe ser único dentro del grupo (dos hermanos del mismo deporte
 * comparten plan, así que no puede usarse el id del plan).
 */
export function calcularMontosHermanos(planes: PlanParaHermano[]): MontoHermano[] {
  const ordenados = [...planes].sort(
    (a, b) => b.amountCents - a.amountCents || a.key.localeCompare(b.key),
  )
  return ordenados.map((p, i) => {
    const arr = p.siblingDiscounts ?? []
    const pct = arr[i] ?? 0
    const monto = Math.round(p.amountCents * (1 - pct / 100))
    return { ...p, descuentoPct: pct, montoFinalCents: monto }
  })
}

// ---------------------------------------------------------------------------
// Generación mensual de cargos (M3.2)
// ---------------------------------------------------------------------------

export type ConfigFinanzas = {
  prorrateoParcial: 'prorratear' | 'completo' | 'no_cobrar'
  vencimientoDia: number
}

/** Días del mes de un período "YYYY-MM". */
export function diasEnMes(periodo: string): number {
  const [y, m] = periodo.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function primerDiaPeriodo(periodo: string): string {
  return `${periodo}-01`
}

export function ultimoDiaPeriodo(periodo: string): string {
  return `${periodo}-${String(diasEnMes(periodo)).padStart(2, '0')}`
}

function diffDias(desde: string, hasta: string): number {
  const a = new Date(desde + 'T12:00:00Z').getTime()
  const b = new Date(hasta + 'T12:00:00Z').getTime()
  return Math.round((b - a) / 86400000)
}

/**
 * Días activos de la membresía dentro del período, inclusivo.
 * Las fechas son strings YYYY-MM-DD, comparan lexicográficamente.
 */
export function diasActivosEnPeriodo(
  startedOn: string,
  endedOn: string | null,
  periodo: string,
): number {
  const inicio = startedOn > primerDiaPeriodo(periodo) ? startedOn : primerDiaPeriodo(periodo)
  const ultimo = ultimoDiaPeriodo(periodo)
  const fin = endedOn && endedOn < ultimo ? endedOn : ultimo
  if (fin < inicio) return 0
  return diffDias(inicio, fin) + 1
}

/**
 * Regla de prorrateo a mitad de mes (configurable por club en
 * clubs.financeConfig.prorrateoParcial). Devuelve null cuando no se cobra.
 */
export function prorratearMonto(
  montoCents: number,
  diasActivos: number,
  diasDelMes: number,
  config: ConfigFinanzas,
): number | null {
  if (diasActivos >= diasDelMes) return montoCents
  if (config.prorrateoParcial === 'completo') return montoCents
  if (config.prorrateoParcial === 'no_cobrar') return null
  return Math.round((montoCents * diasActivos) / diasDelMes)
}

/** Fecha de vencimiento del cargo: día configurado, recortado al fin de mes. */
export function resolverVencimiento(periodo: string, vencimientoDia: number): string {
  const dias = diasEnMes(periodo)
  const dia = Math.min(Math.max(Math.trunc(vencimientoDia) || 1, 1), dias)
  return `${periodo}-${String(dia).padStart(2, '0')}`
}

export type PlanConMonto = {
  id: string
  sport: string | null
  name: string
  amountCents: number
  siblingDiscounts: number[] | null
  validFrom: string
  validTo: string | null
}

export type MembresiaParaCargo = {
  id: string
  accountId: string
  personId: string
  startedOn: string
  endedOn: string | null
  sport: string | null
}

export type CargoGenerado = {
  membershipId: string
  accountId: string
  personId: string
  planName: string
  sport: string | null
  concept: string
  amountCents: number
  descuentoPct: number
  dueOn: string
}

export type CargoOmitido = {
  membershipId: string
  motivo: 'sin_plan_vigente' | 'sin_dias' | 'no_cobrar'
}

export type ResultadoGeneracion = {
  cargos: CargoGenerado[]
  omitidos: CargoOmitido[]
}

/**
 * Motor puro de la generación mensual. Idempotente por construcción: la
 * action lo corre una vez para previsualizar y otra para confirmar con el
 * mismo input → los mismos cargos, y la DB los deduplica con el índice
 * único charges_membership_period_uq (membershipId + period + concept).
 *
 * Reglas aplicadas:
 * - El plan vigente se resuelve al fin del período (precio versionado).
 * - Alta/baja a mitad de mes se prorratea según clubs.financeConfig.
 * - El descuento por hermano se aplica por cuenta (grupo familiar),
 *   ordenando por monto de mayor a menor (los descuentos caen en las más
 *   baratas).
 */
export function generarCargosDelMes(
  periodo: string,
  config: ConfigFinanzas,
  membresias: MembresiaParaCargo[],
  planes: PlanConMonto[],
): ResultadoGeneracion {
  const finPeriodo = ultimoDiaPeriodo(periodo)
  const diasMes = diasEnMes(periodo)
  const planesPorSport = Map.groupBy(planes, (p) => p.sport ?? '__sin_deporte__')

  const bases: { key: string; m: MembresiaParaCargo; plan: PlanConMonto; montoBase: number }[] = []
  const omitidos: CargoOmitido[] = []

  for (const m of membresias) {
    const versions = planesPorSport.get(m.sport ?? '__sin_deporte__') ?? []
    const plan = planVigente(versions, finPeriodo)
    if (!plan) {
      omitidos.push({ membershipId: m.id, motivo: 'sin_plan_vigente' })
      continue
    }
    const dias = diasActivosEnPeriodo(m.startedOn, m.endedOn, periodo)
    if (dias <= 0) {
      omitidos.push({ membershipId: m.id, motivo: 'sin_dias' })
      continue
    }
    const monto = prorratearMonto(plan.amountCents, dias, diasMes, config)
    if (monto === null) {
      omitidos.push({ membershipId: m.id, motivo: 'no_cobrar' })
      continue
    }
    bases.push({ key: m.id, m, plan, montoBase: monto })
  }

  const cargos: CargoGenerado[] = []
  const porCuenta = Map.groupBy(bases, (b) => b.m.accountId)
  for (const [, grupo] of porCuenta) {
    const conDescuento = calcularMontosHermanos(
      grupo.map((b) => ({
        key: b.key,
        amountCents: b.montoBase,
        siblingDiscounts: b.plan.siblingDiscounts,
      })),
    )
    const porKey = new Map(conDescuento.map((c) => [c.key, c]))
    for (const b of grupo) {
      const d = porKey.get(b.key)!
      cargos.push({
        membershipId: b.m.id,
        accountId: b.m.accountId,
        personId: b.m.personId,
        planName: b.plan.name,
        sport: b.plan.sport,
        concept: `Cuota ${b.plan.sport ?? 'social'} · ${periodo.slice(5)}/${periodo.slice(0, 4)}`,
        amountCents: d.montoFinalCents,
        descuentoPct: d.descuentoPct,
        dueOn: resolverVencimiento(periodo, config.vencimientoDia),
      })
    }
  }

  return { cargos, omitidos }
}

// ---------------------------------------------------------------------------
// M3.3 · Cuenta corriente familiar
// ---------------------------------------------------------------------------

export type MovimientoPlata = { direction: 'debito' | 'credito'; amountCents: number }

/**
 * Saldo desde una lista de movimientos (ledger): débito suma deuda, crédito
 * la baja. Es la misma fórmula que la vista account_balances — este helper
 * la deja testeable sin DB.
 */
export function saldoDesdeMovimientos(movs: MovimientoPlata[]): number {
  return movs.reduce((acc, m) => acc + (m.direction === 'debito' ? m.amountCents : -m.amountCents), 0)
}

/** El motivo es obligatorio en todo ajuste manual y toda anulación (brief M3). */
export function validarMotivo(motivo: string): string | null {
  const t = motivo.trim()
  if (t.length < 5) return 'El motivo es obligatorio (mínimo 5 caracteres).'
  if (t.length > 200) return 'El motivo no puede superar los 200 caracteres.'
  return null
}
