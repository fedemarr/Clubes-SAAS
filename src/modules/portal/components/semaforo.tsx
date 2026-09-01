import type { CuentaPortal } from '../queries'

/**
 * Semáforo de cuota (M12). Mismo criterio en el home y en Pagos: rojo si
 * hay cargos vencidos, amarillo si hay cuota pendiente (sin vencidos),
 * verde si el grupo/la cuenta está al día. Colores del brief: verde
 * #22C55E, rojo #EF4444, amarillo #FBBF24, gris #6B7280.
 */
export type TonoSemaforo = 'verde' | 'amarillo' | 'rojo' | 'gris'

export function semaforoFamilia(cuentas: CuentaPortal[]) {
  const vencidos = cuentas.some((c) => c.cargos.some((x) => x.status === 'vencido'))
  const pendientes = cuentas.some((c) => c.cargos.some((x) => x.status === 'pendiente' || x.status === 'parcial'))
  const deuda = cuentas.some((c) => c.balanceCents > 0)

  if (vencidos) return { tono: 'rojo' as const, label: 'Con cuotas vencidas' }
  if (pendientes || deuda) return { tono: 'amarillo' as const, label: 'Cuota pendiente' }
  return { tono: 'verde' as const, label: 'Al día' }
}

export function semaforoCuenta(cuenta: CuentaPortal) {
  const vencidos = cuenta.cargos.some((x) => x.status === 'vencido')
  const pendientes = cuenta.cargos.some((x) => x.status === 'pendiente' || x.status === 'parcial')

  if (vencidos) return { tono: 'rojo' as const, label: 'Vencido' }
  if (pendientes || cuenta.balanceCents > 0) return { tono: 'amarillo' as const, label: 'Pendiente' }
  return { tono: 'verde' as const, label: 'Al día' }
}

const ESTILOS: Record<TonoSemaforo, { bg: string; text: string }> = {
  verde: { bg: 'rgba(34,197,94,0.14)', text: '#15803D' },
  amarillo: { bg: 'rgba(251,191,36,0.18)', text: '#B45309' },
  rojo: { bg: 'rgba(239,68,68,0.12)', text: '#B91C1C' },
  gris: { bg: 'rgba(107,114,128,0.14)', text: '#4B5563' },
}

export function SemaforoBadge({
  tono,
  label,
  className,
  sobreFondoColor = false,
}: {
  tono: TonoSemaforo
  label: string
  className?: string
  sobreFondoColor?: boolean
}) {
  const sobreColor = sobreFondoColor ? { bg: 'rgba(255,255,255,0.16)', text: '#FFFFFF' } : ESTILOS[tono]
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${sobreFondoColor ? 'ring-white/25' : 'ring-transparent'} ${className ?? ''}`}
      style={{ backgroundColor: sobreColor.bg, color: sobreColor.text }}
    >
      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: sobreColor.text }} />
      {label}
    </span>
  )
}