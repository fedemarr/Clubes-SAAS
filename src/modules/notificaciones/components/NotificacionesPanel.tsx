'use client'

import { useState } from 'react'
import { marcarLeida, marcarTodasLeidas } from '../actions'
import type { Notificacion } from '../queries'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { Check, CheckCheck, MailOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

const TIPO_LABEL: Record<string, string> = {
  'cobranza.recordatorio': 'Recordatorio de cobranza',
  'cobranza.aviso_coordinador': 'Aviso al coordinador',
  'cobranza.plan_de_pago': 'Plan de pago',
  'pago.acreditado': 'Pago acreditado',
  'convocatoria.publicada': 'Convocatoria',
}

export function NotificacionesPanel({
  clubSlug,
  iniciales,
}: {
  clubSlug: string
  iniciales: Notificacion[]
}) {
  const [items, setItems] = useState(iniciales)
  const [error, setError] = useState<string | null>(null)

  async function onTodas() {
    setError(null)
    const r = await marcarTodasLeidas(clubSlug)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date() })))
  }

  async function onUna(id: string) {
    setError(null)
    const r = await marcarLeida(clubSlug, { id })
    if (!r.ok) {
      setError(r.error)
      return
    }
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date() } : n)))
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {items.length} notificaciones · {items.filter((n) => !n.readAt).length} sin leer
        </p>
        {items.some((n) => !n.readAt) && (
          <Button size="sm" variant="outline" onClick={onTodas}>
            <CheckCheck className="mr-1.5 size-3.5" /> Marcar todas como leídas
          </Button>
        )}
      </div>

      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}

      {items.length === 0 ? (
        <div className="mt-4 rounded-lg border">
          <EmptyState title="No tenés notificaciones." className="py-10" />
        </div>
      ) : (
        <div className="mt-3 overflow-hidden rounded-lg border">
          {items.map((n) => (
            <div
              key={n.id}
              className={cn(
                'flex items-start justify-between gap-3 border-b px-3 py-3 last:border-0',
                !n.readAt && 'bg-primary/5',
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{TIPO_LABEL[n.type] ?? n.type}</p>
                  {!n.readAt && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                </div>
                <p className="mt-0.5 text-sm text-foreground/90">{n.title}</p>
                {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {new Date(n.createdAt).toLocaleString('es-AR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </p>
              </div>
              {!n.readAt && (
                <Button size="sm" variant="ghost" className="shrink-0" onClick={() => onUna(n.id)}>
                  <Check className="mr-1 size-3.5" /> Leída
                </Button>
              )}
              {n.readAt && <MailOpen className="mt-1 size-4 shrink-0 text-muted-foreground/50" />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
