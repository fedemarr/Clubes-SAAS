'use client'

import { useState } from 'react'
import { confirmarConciliacion, importarExtracto } from '../actions'
import type { ResultadoImportacion } from '../actions'
import { formatARS } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Deudor = { accountId: string; label: string }
type Pendiente = {
  id: string
  method: string
  amount: string
  montoCents: number
  paidAt: Date
  externalRef: string | null
  rawPayload: Record<string, unknown> | null
}

export function ConciliadorForm({
  clubSlug,
  deudores,
  pendientes,
}: {
  clubSlug: string
  deudores: Deudor[]
  pendientes: Pendiente[]
}) {
  const [texto, setTexto] = useState('')
  const [separador, setSeparador] = useState(';')
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null)
  const [asignacion, setAsignacion] = useState<Record<number, string | undefined>>({})
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [acreditados, setAcreditados] = useState(0)
  const [fallos, setFallos] = useState<{ idx: number; error: string }[]>([])

  async function onImportar() {
    setError(null)
    setAcreditados(0)
    setFallos([])
    setCargando(true)
    const r = await importarExtracto(clubSlug, { texto, separador })
    setCargando(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setResultado(r.data)
    const inicial: Record<number, string | undefined> = {}
    for (const m of r.data.movimientos) {
      if (m.propuesta.accountId) inicial[m.idx] = m.propuesta.accountId
    }
    setAsignacion(inicial)
  }

  async function onAcreditarTodo() {
    if (!resultado) return
    setError(null)
    setAcreditados(0)
    setFallos([])
    setCargando(true)
    let ok = 0
    const errores: { idx: number; error: string }[] = []
    for (const m of resultado.movimientos) {
      const accountId = asignacion[m.idx]
      if (!accountId) continue
      const r = await confirmarConciliacion(clubSlug, { pagoId: m.pagoId, accountId })
      if (r.ok) ok += 1
      else errores.push({ idx: m.idx, error: r.error })
    }
    setCargando(false)
    setAcreditados(ok)
    setFallos(errores)
  }

  return (
    <div className="mt-6">
      <div className="grid gap-4 rounded-lg border p-4">
        <div className="grid gap-1.5">
          <Label htmlFor="extracto">Extracto bancario (CSV)</Label>
          <textarea
            id="extracto"
            rows={8}
            className="w-full resize-y rounded-md border bg-background px-3 py-2 font-mono text-xs"
            placeholder={'05/08/2026;65000,00;TRANSFERENCIA JUAN PEREZ\n06/08/2026;52000,50;María González'}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <Label className="text-xs">Separador</Label>
            <Select value={separador} onValueChange={(v) => setSeparador(v ?? ';')}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value=";">Punto y coma (;)</SelectItem>
                <SelectItem value=",">Coma (,)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={onImportar} disabled={cargando || texto.trim() === ''}>
            {cargando ? 'Analizando…' : 'Importar y proponer matcheos'}
          </Button>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>

      {resultado && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium">
              {resultado.movimientos.length} ingresos detectados · total{' '}
              <span className="tabular-nums font-semibold">{formatARS(resultado.totalCents)}</span>
            </h2>
            <Button onClick={onAcreditarTodo} disabled={cargando}>
              {cargando ? 'Acreditando…' : 'Acreditar los confirmados'}
            </Button>
          </div>

          <div className="mt-3 overflow-hidden rounded-lg border">
            <div className="hidden grid-cols-12 gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground sm:grid">
              <span className="col-span-2">Fecha</span>
              <span className="col-span-2 text-right">Monto</span>
              <span className="col-span-4">Detalle</span>
              <span className="col-span-4">Cuenta</span>
            </div>
            {resultado.movimientos.map((m) => (
              <div key={m.pagoId} className="grid grid-cols-1 gap-1 border-b px-3 py-2 last:border-0 sm:grid-cols-12 sm:items-center sm:gap-2">
                <span className="text-sm text-muted-foreground sm:col-span-2">{m.fecha}</span>
                <span className="text-sm font-medium tabular-nums sm:col-span-2 sm:text-right">{formatARS(m.montoCents)}</span>
                <span className="truncate text-sm text-muted-foreground sm:col-span-4">{m.detalle}</span>
                <div className="flex items-center gap-2 sm:col-span-4">
                  {m.propuesta.confianza && (
                    <Badge variant={m.propuesta.confianza === 'alta' ? 'default' : 'outline'} className="whitespace-nowrap">
                      {m.propuesta.confianza === 'alta' ? 'match' : 'probable'}
                    </Badge>
                  )}
                  <Select
                    value={asignacion[m.idx] ?? '__ninguno__'}
                    onValueChange={(v) =>
                      setAsignacion((prev) => ({ ...prev, [m.idx]: v && v !== '__ninguno__' ? v : undefined }))
                    }
                  >
                    <SelectTrigger className="h-8 flex-1 text-xs">
                      <SelectValue placeholder="Sin asignar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__ninguno__">Sin asignar</SelectItem>
                      {deudores.map((d) => (
                        <SelectItem key={d.accountId} value={d.accountId}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {acreditados > 0 && (
        <p className="mt-4 text-sm text-green-700" role="status">
          {acreditados} pagos acreditados.
        </p>
      )}
      {fallos.length > 0 && (
        <div className="mt-4 rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
          {fallos.map((f) => (
            <p key={f.idx}>Fila {f.idx + 1}: {f.error}</p>
          ))}
        </div>
      )}

      <section className="mt-10">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Bandeja · transferencias sin identificar
        </h2>
        {pendientes.length === 0 ? (
          <div className="rounded-lg border border-dashed py-8 text-center">
            <p className="text-sm text-muted-foreground">No hay transferencias pendientes de conciliar.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            {pendientes.map((p) => (
              <div key={p.id} className="flex items-center justify-between border-b px-3 py-2 text-sm last:border-0">
                <div>
                  <p className="font-medium tabular-nums">{formatARS(p.montoCents)}</p>
                  <p className="text-xs text-muted-foreground">
                    {String((p.rawPayload as { detalle?: string } | null)?.detalle ?? p.externalRef ?? '—')} ·{' '}
                    {new Intl.DateTimeFormat('es-AR', { dateStyle: 'short' }).format(p.paidAt)}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">Sin asignar</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
