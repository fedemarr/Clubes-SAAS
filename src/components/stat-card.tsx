import type { ComponentType, ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const ACCENTS = {
  default: 'text-foreground',
  success: 'text-green-600',
  danger: 'text-red-600',
} as const

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = 'default',
}: {
  label: string
  value: ReactNode
  hint?: string
  icon?: ComponentType<{ className?: string }>
  accent?: keyof typeof ACCENTS
}) {
  return (
    <Card className="py-4">
      <CardContent className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className={cn('mt-1 text-2xl font-semibold tracking-tight tabular-nums', ACCENTS[accent])}>{value}</p>
          {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
        {Icon && (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="size-4" />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
