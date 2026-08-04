'use client'

import { useState } from 'react'
import { generarLinkPago } from '../actions'
import type { LinkDePago } from '../actions'
import { formatARS } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function LinkDePagoForm({ clubSlug, accountId }: { clubSlug: string; accountId: string }) {
  const [periodo, setPeriodo] = useState(() => new Date().toISOString().slice(0, 7))
  const [link, setLink] = useState<LinkDePago | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  async function generar() {
    setError(null)
    setCargando(true)
    const r = await generarLinkPago(clubSlug, { accountId, periodo })
    setCargando(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setLink(r.data)
  }

  return (
    <div className="rounded-lg border p-4">
      <h2 className="text-sm font-medium">Link de pago (Mercado Pago)</h2>
      <p className="text-xs text-muted-foreground">
        Cobra la deuda actual con un solo link. El pago acreditado concilia solo contra los cargos abiertos.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <Label htmlFor="mp-periodo" className="text-xs">Período de referencia</Label>
          <Input id="mp-periodo" type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="w-40" />
        </div>
        <Button onClick={generar} disabled={cargando}>
          {cargando ? 'Generando…' : 'Generar link'}
        </Button>
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}

      {link && (
        <div className="mt-4 rounded-lg bg-muted p-3">
          <p className="text-sm">
            Monto: <span className="font-semibold tabular-nums">{formatARS(link.montoCents)}</span>
            {' · '}
            <span className="text-muted-foreground">{link.periodo}</span>
          </p>
          {link.modo === 'dev' && (
            <p className="mt-1 text-xs text-amber-700">{link.aviso}</p>
          )}
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block break-all rounded-md border border-primary px-3 py-1.5 text-sm text-primary hover:bg-accent"
          >
            {link.url}
          </a>
        </div>
      )}
    </div>
  )
}
