import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'

/** Card de sección del dashboard con título opcional y enlace "ver todo". */
export function SectionCard(
  { title, action, children, className }: {
    title?: string
    action?: ReactNode
    children: ReactNode
    className?: string
  },
) {
  return (
    <Card className={className}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2 px-4 pt-4">
          {title && <h3 className="text-sm font-semibold tracking-tight">{title}</h3>}
          {action}
        </div>
      )}
      <CardContent className="pt-3">{children}</CardContent>
    </Card>
  )
}
