'use client'

import { useState } from 'react'
import {
  acreditarLoteDebito,
  generarLoteDebito,
  importarRechazosDebito,
  registrarCbuDebito,
} from '../actions'
import type { ResultadoLoteDebito, ResultadoRechazosDebito } from '../actions'
import { formatARS } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/empty-state'

export type CuentaDebitableVM = {
  accountId: string
  label: string | null
  holderNombre: string
  holderApellido: string
  cbu: string
  deudaCents: number
}

export type LoteDebitoVM = {
  id: string
  numero: string
  banco: string
  fechaEjecucion: string
  status: string
  montoTotalCents: number
  registros: number
  acreditados: number
  rechazados: number
  generadoPor: string | null
  createdAt: string
}

const estadoBadge: Record<string, { label: string; variant: 'default' | 'outline' | 'secondary' | 'destructive' }> = {
  generado: { label: 'Generado', variant: 'outline' },
  acreditado: { label: 'Acreditado', variant: 'default' },
  cerrado: { label: 'Cerrado', variant: 'secondary' },
}

function bajarArchivo(texto: string, filename: string) {
  const blob = new Blob([`\uFEFF${texto}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function DebitoPanel({
  clubSlug,
  sinCbu,
  candidatas,
  lotes,
}: {
  clubSlug: string
  sinCbu: CuentaDebitableVM[]
  candidatas: CuentaDebitableVM[]
  lotes: LoteDebitoVM[]
}) {
  const [cbus, setCbus] = useState<Record<string, string>>(() => {
    const inicial: Record<string, string> = {}
    for (const c of [...sinCbu, ...candidatas]) inicial[c.accountId] = c.cbu ?? ''
    return inicial
  })
  const [guardando, setGuardando] = useState<string | null>(null)
  const [errorCbu, setErrorCbu] = useState<string | null>(null)

  const [fechaEjecucion, setFechaEjecucion] = useState('')
  const [generando, setGenerando] = useState(false)
  const [loteGenerado, setLoteGenerado] = useState<ResultadoLoteDebito | null>(null)
  const [errorGenerar, setErrorGenerar] = useState<string | null>(null)

  const [acreditandoId, setAcreditandoId] = useState<string | null>(null)
  const [confirmarAcreditar, setConfirmarAcreditar] = useState<string | null>(null)
  const [acreditadoMsg, setAcreditadoMsg] = useState<string | null>(null)
  const [errorAcreditar, setErrorAcreditar] = useState<string | null>(null)

  const [rechazosAbierto, setRechazosAbierto] = useState<string | null>(null)
  const [textoRechazos, setTextoRechazos] = useState('')
  const [procesandoRechazos, setProcesandoRechazos] = useState(false)
  const [resultadoRechazos, setResultadoRechazos] = useState<ResultadoRechazosDebito | null>(null)
  const [errorRechazos, setErrorRechazos] = useState<string | null>(null)

  async function guardarCbu(accountId: string) {
    setErrorCbu(null)
    setGuardando(accountId)
    const cbu = (cbus[accountId] ?? '').trim()
    const r = await registrarCbuDebito(clubSlug, { accountId, cbu })
    setGuardando(null)
    if (!r.ok) setErrorCbu(r.error)
  }

  async function onGenerarLote() {
    if (!fechaEjecucion) return
    setErrorGenerar(null)
    setLoteGenerado(null)
    setGenerando(true)
    const r = await generarLoteDebito(clubSlug, { banco: 'generico', fechaEjecucion })
    setGenerando(false)
    if (!r.ok) {
      setErrorGenerar(r.error)
      return
    }
    setLoteGenerado(r.data)
    bajarArchivo(r.data.archivo, r.data.filename)
  }

  async function onAcreditarLote(loteId: string) {
    setErrorAcreditar(null)
    setAcreditadoMsg(null)
    setAcreditandoId(loteId)
    const r = await acreditarLoteDebito(clubSlug, { loteId })
    setAcreditandoId(null)
    setConfirmarAcreditar(null)
    if (!r.ok) {
      setErrorAcreditar(r.error)
      return
    }
    setAcreditadoMsg(`Lote ${loteId.slice(0, 8)}…: ${r.data.acreditados} débitos acreditados por ${formatARS(r.data.montoCents)}.`)
  }

  async function onImportarRechazos(loteId: string) {
    setErrorRechazos(null)
    setResultadoRechazos(null)
    setProcesandoRechazos(true)
    const r = await importarRechazosDebito(clubSlug, { loteId, texto: textoRechazos, separador: ';' })
    setProcesandoRechazos(false)
    if (!r.ok) {
      setErrorRechazos(r.error)
      return
    }
    setResultadoRechazos(r.data)
    setTextoRechazos('')
    setRechazosAbierto(null)
  }

  const cuentas = [...sinCbu, ...candidatas]

  return (
    <div className="mt-6 space-y-10">
      {/* CBU por cuenta */}
      <section>
        <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          CBU para débito
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Cargá el CBU del titular. El débito solo cubre cuentas con CBU y saldo deudor.
        </p>
        {cuentas.length === 0 ? (
          <EmptyState title="No hay cuentas deudoras para configurar." className="py-8" />
        ) : (
          <div className="overflow-hidden rounded-lg border">
            {cuentas.map((c) => (
              <div
                key={c.accountId}
                className="grid grid-cols-1 items-center gap-2 border-b px-3 py-2 last:border-0 sm:grid-cols-12 sm:gap-3"
              >
                <div className="sm:col-span-5">
                  <p className="truncate text-sm font-medium">
                    {c.cbu ? c.label ?? `${c.holderApellido}, ${c.holderNombre}` : `${c.holderApellido}, ${c.holderNombre}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatARS(c.deudaCents)} de deuda {!c.cbu && '· sin CBU'}
                  </p>
                </div>
                <div className="flex items-center gap-2 sm:col-span-7">
                  <Input
                    className="h-8 font-mono text-xs"
                    maxLength={22}
                    placeholder="0000000000000000000000"
                    value={cbus[c.accountId] ?? ''}
                    onChange={(e) => setCbus((prev) => ({ ...prev, [c.accountId]: e.target.value }))}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={guardando === c.accountId}
                    onClick={() => guardarCbu(c.accountId)}
                  >
                    {guardando === c.accountId ? 'Guardando…' : 'Guardar'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        {errorCbu && <p role="alert" className="mt-2 text-sm text-destructive">{errorCbu}</p>}
      </section>

      {/* Generador de lote */}
      <section>
        <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Generar lote de débito
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Crea un payment pendiente por cuenta y baja el CSV genérico para subir al banco. La
          acreditación se confirma cuando el banco devuelve el resultado.
        </p>
        <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3 sm:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor="fecha-ejec">Fecha de ejecución</Label>
            <Input
              id="fecha-ejec"
              type="date"
              value={fechaEjecucion}
              onChange={(e) => setFechaEjecucion(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Banco</Label>
            <Select value="generico" onValueChange={() => undefined}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="generico">Genérico (CSV)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={onGenerarLote} disabled={generando || !fechaEjecucion || candidatas.length === 0}>
            {generando ? 'Generando…' : `Generar lote (${candidatas.length} cuentas)`}
          </Button>
        </div>
        {errorGenerar && <p role="alert" className="mt-2 text-sm text-destructive">{errorGenerar}</p>}
        {loteGenerado && (
          <div className="mt-3 rounded-lg border border-green-600/30 bg-green-50 p-3 text-sm">
            <p className="font-medium">
              Lote {loteGenerado.numero} · {loteGenerado.registros} cuentas ·{' '}
              <span className="tabular-nums">{formatARS(loteGenerado.totalCents)}</span>
            </p>
            <p className="mt-1 text-muted-foreground">El CSV se descargó: {loteGenerado.filename}</p>
          </div>
        )}
      </section>

      {/* Lotes */}
      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Lotes
        </h2>
        {lotes.length === 0 ? (
          <EmptyState title="Todavía no hay lotes generados." className="py-8" />
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <div className="hidden grid-cols-12 gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground sm:grid">
              <span className="col-span-2">Lote</span>
              <span className="col-span-2">Ejecución</span>
              <span className="col-span-2 text-right">Monto</span>
              <span className="col-span-2 text-right">Estado</span>
              <span className="col-span-4" />
            </div>
            {lotes.map((l) => {
              const badge = estadoBadge[l.status] ?? { label: l.status, variant: 'outline' as const }
              const pendientes = l.registros - l.acreditados - l.rechazados
              return (
                <div key={l.id}>
                  <div className="grid grid-cols-1 gap-2 border-b px-3 py-2 last:border-0 sm:grid-cols-12 sm:items-center sm:gap-3">
                    <div className="sm:col-span-2">
                      <p className="font-mono text-sm font-medium">{l.numero}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.acreditados}/{l.registros} acreditados
                        {l.rechazados > 0 && ` · ${l.rechazados} rechazados`}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground sm:col-span-2">{l.fechaEjecucion}</p>
                    <p className="text-sm font-medium tabular-nums sm:col-span-2 sm:text-right">
                      {formatARS(l.montoTotalCents)}
                    </p>
                    <div className="sm:col-span-2 sm:text-right">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:col-span-4 sm:justify-end">
                      {l.status === 'generado' && pendientes > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={acreditandoId === l.id}
                          onClick={() => {
                            if (confirmarAcreditar === l.id) onAcreditarLote(l.id)
                            else setConfirmarAcreditar(l.id)
                          }}
                        >
                          {confirmarAcreditar === l.id
                            ? acreditandoId === l.id
                              ? 'Acreditando…'
                              : '¿Confirmar acreditación?'
                            : 'Acreditar lote'}
                        </Button>
                      )}
                      {l.status === 'generado' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setRechazosAbierto(rechazosAbierto === l.id ? null : l.id)}
                        >
                          Rechazos
                        </Button>
                      )}
                    </div>
                  </div>

                  {rechazosAbierto === l.id && (
                    <div className="border-b bg-muted/30 px-3 py-3">
                      <Label className="text-xs">Archivo de rechazos del banco (CSV)</Label>
                      <textarea
                        rows={4}
                        className="mt-1.5 w-full resize-y rounded-md border bg-background px-3 py-2 font-mono text-xs"
                        placeholder={'debito:D-2026-001:abc-123;2850590940090418135201;65000.00;FONDOS INSUFICIENTES'}
                        value={textoRechazos}
                        onChange={(e) => setTextoRechazos(e.target.value)}
                      />
                      <div className="mt-2 flex items-center gap-2">
                        <Button size="sm" onClick={() => onImportarRechazos(l.id)} disabled={procesandoRechazos || textoRechazos.trim() === ''}>
                          {procesandoRechazos ? 'Procesando…' : 'Importar rechazos'}
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Marca rechazados o revierte acreditados (asiento inverso).
                        </p>
                      </div>
                      {errorRechazos && <p role="alert" className="mt-2 text-sm text-destructive">{errorRechazos}</p>}
                      {resultadoRechazos && (
                        <p role="status" className="mt-2 text-sm text-green-700">
                          {resultadoRechazos.rechazados} rechazados · {resultadoRechazos.reversados} acreditados revertidos
                          {resultadoRechazos.sinMatch.length > 0 && ` · ${resultadoRechazos.sinMatch.length} sin coincidencia`}.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {acreditadoMsg && <p role="status" className="mt-3 text-sm text-green-700">{acreditadoMsg}</p>}
        {errorAcreditar && <p role="alert" className="mt-3 text-sm text-destructive">{errorAcreditar}</p>}
      </section>
    </div>
  )
}
