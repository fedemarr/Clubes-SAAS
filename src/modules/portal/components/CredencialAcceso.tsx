'use client'

import { useState } from 'react'
import { QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { QrCarnet } from './QrCarnet'

/**
 * Credencial digital del home del portal (M12): botón prominente "Mostrar
 * QR" que expande el código rotativo (reusa QrCarnet) junto con nombre,
 * documento y estado. Las wallets (Apple/Google) quedan visuales hasta
 * que exista integración real.
 */
export function CredencialAcceso({
  clubSlug,
  nombre,
  documento,
  miembro,
}: {
  clubSlug: string
  nombre: string
  documento: string
  miembro: string
}) {
  const [abierto, setAbierto] = useState(false)

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold tracking-tight">Credencial digital</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Mostrá el código para entrar al club.</p>
        </div>
        <Button variant={abierto ? 'outline' : 'default'} onClick={() => setAbierto((a) => !a)}>
          <QrCode className="size-4" />
          {abierto ? 'Ocultar QR' : 'Mostrar QR'}
        </Button>
      </div>

      {abierto && (
        <div className="mt-4 grid items-start gap-4 sm:grid-cols-[auto_1fr]">
          <QrCarnet clubSlug={clubSlug} />
          <div className="space-y-1.5 text-sm">
            <p className="text-lg font-semibold tracking-tight">{nombre}</p>
            <p className="text-muted-foreground">{documento}</p>
            <p className="text-muted-foreground">{miembro}</p>
            <p className="pt-1 text-xs text-muted-foreground">
              El QR se renueva automáticamente cada 30 segundos.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" size="sm" disabled>
                Apple Wallet · Actualizar
              </Button>
              <Button variant="outline" size="sm" disabled>
                Google Wallet · Actualizar
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Las wallets llegan próximamente.</p>
          </div>
        </div>
      )}
    </section>
  )
}