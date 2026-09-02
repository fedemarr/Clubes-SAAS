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

// Texto en clases de Tailwind (no hex fijo): el portal puede renderizarse en
// modo oscuro (club.branding.portalTheme === 'dark', clase "dark" en un
// ancestro — ver layout de [club]) y los tonos *-700 quedan casi invisibles
// sobre el fondo casi negro. dark:* (definido como `.dark *` en
// globals.css) resuelve un tono más claro ahí sin tocar el caso claro.
const ESTILOS: Record<TonoSemaforo, { bg: string; text: string }> = {
  verde: { bg: 'bg-green-500/15', text: 'text-green-700 dark:text-green-300' },
  amarillo: { bg: 'bg-amber-400/20', text: 'text-amber-700 dark:text-amber-300' },
  rojo: { bg: 'bg-red-500/15', text: 'text-red-700 dark:text-red-300' },
  gris: { bg: 'bg-gray-500/15', text: 'text-gray-600 dark:text-gray-300' },
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
  const sobreColor = sobreFondoColor ? { bg: 'bg-white/16', text: 'text-white' } : ESTILOS[tono]
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${sobreFondoColor ? 'ring-white/25' : 'ring-transparent'} ${sobreColor.bg} ${sobreColor.text} ${className ?? ''}`}
    >
      <span className="size-2 shrink-0 rounded-full bg-current" />
      {label}
    </span>
  )
}