/**
 * Reglas de negocio puras del módulo morosidad (M5), sin dependencias de base.
 * El motor decide qué contactar, cuándo y con qué texto; el canal real
 * (WhatsApp / mail) se enchufa desde la capa transversal de notificaciones.
 */

// ---------------------------------------------------------------------------
// Antigüedad de la deuda
// ---------------------------------------------------------------------------

export type TramoAntiguedad = 1 | 2 | 3 | 4

/**
 * Tramo por meses vencidos: 1 = menos de un mes, 2 = un mes, 3 = dos meses,
 * 4 = tres o más. Es el tramo que muestra el panel (brief M5) y el que se
 * usa para segmentar.
 */
export function tramoAntiguedad(meses: number): TramoAntiguedad {
  if (meses >= 3) return 4
  if (meses === 2) return 3
  if (meses === 1) return 2
  return 1
}

/** Meses enteros transcurridos desde una fecha ISO (yyyy-mm-dd). */
export function mesesEntre(fechaISO: string, hoy = new Date()): number {
  const [y, m] = fechaISO.split('-').map(Number)
  if (!y || !m) return 0
  return Math.max(0, (hoy.getFullYear() - y) * 12 + (hoy.getMonth() + 1 - m))
}

/** Días corridos desde una fecha ISO (yyyy-mm-dd), sin contar hoy. */
export function diasDesde(fechaISO: string, hoy = new Date()): number {
  const [y, m, d] = fechaISO.split('-').map(Number)
  if (!y || !m || !d) return 0
  const venc = Date.UTC(y, m - 1, d)
  const h = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return Math.max(0, Math.round((h - venc) / 86400000))
}

// ---------------------------------------------------------------------------
// Horario de silencio (brief M5: ningún mensaje de cobranza entre 21 y 9)
// ---------------------------------------------------------------------------

export const HORARIO_SILENCIO = { desde: 21, hasta: 9 } as const

export function enHorarioSilencio(
  ahora = new Date(),
  timezone = 'America/Argentina/Buenos_Aires',
): boolean {
  const h = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' }).format(
      ahora,
    ),
  )
  return h >= HORARIO_SILENCIO.desde || h < HORARIO_SILENCIO.hasta
}

// ---------------------------------------------------------------------------
// Plantillas
// ---------------------------------------------------------------------------

export type VarsPlantilla = Record<string, string | number>

/** Reemplaza {{variable}} y deja intactas las que falten. */
export function renderizarPlantilla(body: string, vars: VarsPlantilla): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    key in vars ? String(vars[key]) : `{{${key}}}`,
  )
}

// ---------------------------------------------------------------------------
// Motor de reglas de cobranza
// ---------------------------------------------------------------------------

export type DeudorCobranza = {
  accountId: string
  deudaCents: number
  diasDesdeVencimiento: number
  /** Tutor pagador: a quién van los mensajes. null = sin destinatario. */
  destino: { userId: string | null; nombre: string; apellido: string } | null
}

export type ReglaCobranza = {
  id: string
  name: string
  /** Días desde el vencimiento del cargo más viejo para que dispare. */
  dias: number
  channel: 'whatsapp' | 'mail' | 'coordinador' | 'suspension'
  templateKey: string | null
  /** Ventana de no-duplicado en días (brief: máximo 1 mensaje por semana). */
  dedupeDias: number
  enabled: boolean
}

export type ContactoReciente = {
  accountId: string
  ruleId: string | null
  channel: string
  deliveredAt: Date
}

export type DisparoCobranza = {
  accountId: string
  ruleId: string
  name: string
  channel: ReglaCobranza['channel']
  kind: 'mensaje' | 'aviso' | 'sugerencia'
  body: string | null
  destinoUserId: string | null
}

export type ReglaOmitida = { accountId: string; ruleId: string; motivo: string }

/**
 * Decide qué contactar ahora. Reglas de negocio del brief:
 *  - Nada entre las 21 y las 9.
 *  - Máximo un mensaje de cobranza por cuenta por semana (cualquier regla
 *    de mensaje bloquee a las demás; coordinador y suspensión deduplican
 *    por su propia regla).
 *  - Los mensajes van al tutor pagador, jamás al menor (destino).
 *  - La suspensión nunca es automática: acá solo se sugiere.
 */
export function evaluarReglasCobranza({
  deudores,
  reglas,
  plantillas,
  contactosRecientes,
  ahora = new Date(),
  timezone = 'America/Argentina/Buenos_Aires',
  varsDeudor,
}: {
  deudores: DeudorCobranza[]
  reglas: ReglaCobranza[]
  plantillas: Record<string, string>
  contactosRecientes: ContactoReciente[]
  ahora?: Date
  timezone?: string
  varsDeudor?: (d: DeudorCobranza) => VarsPlantilla
}): { disparos: DisparoCobranza[]; omitidos: ReglaOmitida[] } {
  const disparos: DisparoCobranza[] = []
  const omitidos: ReglaOmitida[] = []

  for (const d of deudores) {
    for (const r of reglas) {
      if (!r.enabled) continue
      if (d.diasDesdeVencimiento < r.dias) continue

      const esMensaje = r.channel === 'whatsapp' || r.channel === 'mail'

      if (esMensaje) {
        if (!d.destino) {
          omitidos.push({ accountId: d.accountId, ruleId: r.id, motivo: 'sin destinatario pagador' })
          continue
        }
        if (enHorarioSilencio(ahora, timezone)) {
          omitidos.push({ accountId: d.accountId, ruleId: r.id, motivo: 'silencio nocturno' })
          continue
        }
        if (!r.templateKey || !plantillas[r.templateKey]) {
          omitidos.push({ accountId: d.accountId, ruleId: r.id, motivo: 'sin plantilla' })
          continue
        }
      }

      const bloqueado = contactosRecientes.some((c) => {
        if (c.accountId !== d.accountId) return false
        if (esMensaje) {
          if (c.channel !== 'whatsapp' && c.channel !== 'mail') return false
        } else if (c.channel !== r.channel || c.ruleId !== r.id) {
          return false
        }
        return ahora.getTime() - c.deliveredAt.getTime() < r.dedupeDias * 86400000
      })
      if (bloqueado) {
        omitidos.push({ accountId: d.accountId, ruleId: r.id, motivo: 'ya contactado' })
        continue
      }

      if (esMensaje) {
        const vars = varsDeudor ? varsDeudor(d) : {}
        disparos.push({
          accountId: d.accountId,
          ruleId: r.id,
          name: r.name,
          channel: r.channel,
          kind: 'mensaje',
          body: renderizarPlantilla(plantillas[r.templateKey!], vars),
          destinoUserId: d.destino!.userId,
        })
      } else {
        disparos.push({
          accountId: d.accountId,
          ruleId: r.id,
          name: r.name,
          channel: r.channel,
          kind: r.channel === 'suspension' ? 'sugerencia' : 'aviso',
          body: null,
          destinoUserId: null,
        })
      }
    }
  }

  return { disparos, omitidos }
}

// ---------------------------------------------------------------------------
// Planes de pago (M5.3)
// ---------------------------------------------------------------------------

export type CuotaPlan = { numero: number; fecha: string; montoCents: number }

/** Suma meses a una fecha ISO conservando el día (clampa al fin de mes). */
export function sumarMeses(fechaISO: string, meses: number): string {
  const [y, m, d] = fechaISO.split('-').map(Number)
  if (!y || !m || !d) return fechaISO
  const primero = new Date(Date.UTC(y, m - 1 + meses, 1))
  const ultimoDia = new Date(Date.UTC(primero.getUTCFullYear(), primero.getUTCMonth() + 1, 0)).getUTCDate()
  const dia = Math.min(d, ultimoDia)
  return new Date(Date.UTC(primero.getUTCFullYear(), primero.getUTCMonth(), dia)).toISOString().slice(0, 10)
}

/**
 * Divide una deuda en N cuotas mensuales. El sobrante (centavos que no
 * entran en la división entera) se reparte de a un centavo en las primeras
 * cuotas, para que la suma siempre sea exacta. Monto nunca menor a la cuota
 * mínima de planDePago... acá simplemente la división exacta.
 */
export function planDePago(deudaCents: number, cuotas: number, primeraFecha: string): CuotaPlan[] {
  if (deudaCents <= 0 || cuotas <= 0) return []
  const base = Math.floor(deudaCents / cuotas)
  const resto = deudaCents - base * cuotas
  return Array.from({ length: cuotas }, (_, i) => ({
    numero: i + 1,
    fecha: sumarMeses(primeraFecha, i),
    montoCents: base + (i < resto ? 1 : 0),
  }))
}

/** Avance de un plan: cuántas cuotas vencieron y cuánto se pagó de ellas. */
export function avancePlan({
  cuotas,
  pagadoDesdeInicioCents,
}: {
  cuotas: CuotaPlan[]
  pagadoDesdeInicioCents: number
}): { vencidas: number; pagas: number; restanteCents: number } {
  const vencidas = cuotas.length
  let restanteCents = cuotas.reduce((acc, c) => acc + c.montoCents, 0)
  let pagas = 0
  for (const c of cuotas) {
    if (pagadoDesdeInicioCents >= c.montoCents) {
      pagadoDesdeInicioCents -= c.montoCents
      pagas += 1
      restanteCents -= c.montoCents
    } else {
      break
    }
  }
  return { vencidas, pagas, restanteCents }
}
