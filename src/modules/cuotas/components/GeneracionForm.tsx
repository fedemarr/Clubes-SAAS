'use client'

import { useState } from 'react'
import { confirmarCargos, previsualizarCargos } from '../actions'
import type { Previsualizacion } from '../actions'
import { formatARS } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const PRORRATEO_LABELS: Record<string, string> = {
  prorratear: 'prorratear por días',
  completo: 'cobrar mes completo',
  no_cobrar: 'no cobrar altas/bajas a mitad de mes',
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function mesNombre(periodo: string): string {
  const [, m] = periodo.split('-')
  return MESES[Number(m) - 1] ?? periodo
}

export function GeneracionForm({ clubSlug }: { clubSlug: string }) {
  const [periodo, setPeriodo] = useState(() => new Date().toISOString().slice(0, 7))
  const [preview, setPreview] = useState<Previsualizacion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)

  async function onPrevisualizar() {
    setError(null)
    setResultado(null)
    setCargando(true)
    const r = await previsualizarCargos(clubSlug, { periodo })
    setCargando(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setPreview(r.data)
  }

  async function onConfirmar() {
    if (!preview) return
    setError(null)
    setConfirmando(true)
    const r = await confirmarCargos(clubSlug, { periodo: preview.periodo })
    setConfirmando(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setResultado(
      `${r.data.insertados} cargos generados · ${r.data.existentes} ya estaban (no se duplicaron)`,
    )
  }

  return (
    <div className="mt-6 max-w-3xl">
      <form action={onPrevisualizar} className="grid max-w-md gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="periodo">Período</Label>
          <Input id="periodo" type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} required />
        </div>
        <Button type="submit" disabled={cargando}>
          {cargando ? 'Calculando…' : 'Previsualizar'}
        </Button>
      </form>

      {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}

      {preview && (
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-medium">
                {mesNombre(preview.periodo)} — previsualización
              </h2>
              <p className="text-xs text-muted-foreground">
                {preview.cantidad} cargos · total{' '}
                <span className="tabular-nums font-semibold">{formatARS(preview.totalCents)}</span> ·{' '}
                {PRORRATEO_LABELS[preview.config.prorrateoParcial] ?? preview.config.prorrateoParcial} ·
                vence el {preview.config.vencimientoDia} · {preview.omitidos} omitidos
              </p>
            </div>
            <Button onClick={onConfirmar} disabled={confirmando || preview.cantidad === 0}>
              {confirmando ? 'Generando…' : 'Confirmar y generar'}
            </Button>
          </div>

          {preview.cuentas.map((cuenta) => (
            <div key={cuenta.accountId} className="mt-4">
              <div className="mb-1 flex items-baseline justify-between">
                <h3 className="text-sm font-medium">
                  {cuenta.cuentaLabel ?? `${cuenta.personaApellido}, ${cuenta.personaNombre}`}
                </h3>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {formatARS(cuenta.totalCents)}
                </span>
              </div>
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {cuenta.cargos.map((c) => (
                    <tr key={`${c.membershipId}-${c.concept}`} className="border-b">
                      <td className="py-1.5">{c.planName}</td>
                      <td className="py-1.5 text-muted-foreground">
                        {c.personaApellido}, {c.personaNombre}
                      </td>
                      <td className="py-1.5 text-xs text-muted-foreground">
                        {c.descuentoPct > 0 && `${c.descuentoPct}% dto.`}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{formatARS(c.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {preview.omitidos > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {preview.omitidos} membresías omitidas (sin plan vigente en el período, sin días activos o
              con regla de no cobrar).
            </p>
          )}
        </div>
      )}

      {resultado && (
        <p className="mt-4 text-sm text-green-700" role="status">{resultado}</p>
      )}
    </div>
  )
}
