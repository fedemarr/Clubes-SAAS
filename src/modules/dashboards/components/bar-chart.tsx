import { cn } from '@/lib/utils'
import { formatARS } from '@/lib/money'

/**
 * Gráfico de barras horizontal en CSS puro (sin librería de charts),
 * siguiendo el precedente del módulo de morosidad. Cada barra muestra su
 * etiqueta, el valor formateado y un track relleno proporcional al máximo.
 */
export function Barra(
  { label, valor, max, color = 'bg-primary/70', hint }: {
    label: string
    valor: number
    max: number
    color?: string
    hint?: string
  },
) {
  const pct = max > 0 ? Math.max(2, Math.round((valor / max) * 100)) : 0
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="truncate text-xs font-medium text-foreground">{label}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {hint ?? formatARS(valor)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
