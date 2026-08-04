'use client'

import { useState } from 'react'
import { buscarCuentaCobro, obtenerDeudaCobro, registrarPago } from '../actions'
import type { CuentaCobro, Recibo } from '../actions'
import type { CargoConDeuda } from '../queries'
import { formatARS } from '@/lib/money'
import { parsearPesosACentavos } from '../service'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function periodLabel(period: string): string {
  const [y, m] = period.split('-')
  return `${MESES[Number(m) - 1] ?? ''} ${y}`
}

type Paso = 'buscar' | 'cuenta' | 'recibo'

export function PantallaCobrador({ clubSlug }: { clubSlug: string }) {
  const [paso, setPaso] = useState<Paso>('buscar')
  const [texto, setTexto] = useState('')
  const [cuentas, setCuentas] = useState<CuentaCobro[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [cuenta, setCuenta] = useState<CuentaCobro | null>(null)
  const [cargos, setCargos] = useState<CargoConDeuda[]>([])
  const [totalDeuda, setTotalDeuda] = useState(0)

  const [monto, setMonto] = useState('')
  const [registrando, setRegistrando] = useState(false)
  const [recibo, setRecibo] = useState<Recibo | null>(null)

  async function buscar() {
    setError(null)
    setCargando(true)
    const r = await buscarCuentaCobro(clubSlug, texto)
    setCargando(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setCuentas(r.data)
  }

  async function abrirCuenta(c: CuentaCobro) {
    setError(null)
    setCuenta(c)
    setCargando(true)
    const r = await obtenerDeudaCobro(clubSlug, c.id)
    setCargando(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setCargos(r.data.cargos)
    setTotalDeuda(r.data.totalCents)
    setPaso('cuenta')
  }

  async function cobrar() {
    const montoCents = parsearPesosACentavos(monto)
    if (montoCents <= 0) {
      setError('Ingresá un monto mayor a cero.')
      return
    }
    if (!cuenta) return
    setError(null)
    setRegistrando(true)
    const r = await registrarPago(clubSlug, { accountId: cuenta.id, montoCents, metodo: 'efectivo' })
    setRegistrando(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setRecibo(r.data)
    setPaso('recibo')
  }

  if (paso === 'recibo' && recibo) {
    return (
      <div className="mx-auto max-w-md">
        <div className="rounded-xl border p-5 text-center">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Recibo de pago</p>
          <p className="mt-1 font-mono text-sm text-muted-foreground">Nº {recibo.numero}</p>
          <p className="mt-4 text-3xl font-semibold tabular-nums">{formatARS(recibo.montoCents)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {recibo.cuentaLabel ?? `${recibo.holderApellido}, ${recibo.holderNombre}`}
          </p>
          <p className="text-xs text-muted-foreground">Efectivo · {new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(recibo.pagadoFecha)}</p>
        </div>

        {recibo.imputaciones.length > 0 && (
          <div className="mt-4 rounded-xl border">
            <p className="border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Imputado a
            </p>
            {recibo.imputaciones.map((i) => (
              <div key={i.chargeId} className="flex justify-between px-4 py-2 text-sm">
                <span className="text-muted-foreground">Cargo</span>
                <span className="tabular-nums">{formatARS(i.amountCents)}</span>
              </div>
            ))}
            {recibo.sobranteCents > 0 && (
              <div className="flex justify-between border-t px-4 py-2 text-sm">
                <span className="text-muted-foreground">Excedente a cuenta</span>
                <span className="tabular-nums">{formatARS(recibo.sobranteCents)}</span>
              </div>
            )}
          </div>
        )}

        <p className="mt-3 text-center text-xs text-muted-foreground">
          Cobró {recibo.cobradoPorNombre ?? ''} {recibo.cobradoPorApellido ?? ''}
        </p>

        <div className="mt-6 flex gap-2">
          <Button
            className="flex-1"
            onClick={() => {
              setPaso('buscar')
              setRecibo(null)
              setCuenta(null)
              setCargos([])
              setMonto('')
              setTexto('')
              setCuentas([])
            }}
          >
            Nuevo pago
          </Button>
        </div>
      </div>
    )
  }

  if (paso === 'cuenta' && cuenta) {
    return (
      <div className="mx-auto max-w-md">
        <Button variant="ghost" className="-ml-2 mb-2" onClick={() => setPaso('buscar')}>
          ← Volver
        </Button>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">{cuenta.label ?? `${cuenta.holderApellido}, ${cuenta.holderNombre}`}</h1>
            <p className="text-xs text-muted-foreground">{cuenta.holderApellido}, {cuenta.holderNombre}{cuenta.documento ? ` · DNI ${cuenta.documento}` : ''}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Deuda</p>
            <p className={`text-lg font-semibold tabular-nums ${totalDeuda > 0 ? 'text-destructive' : 'text-green-700'}`}>
              {formatARS(totalDeuda)}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border">
          {cargos.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Sin deuda. Podés cobrar y queda como excedente a cuenta.</p>
          ) : (
            cargos.map((c) => (
              <div key={c.id} className="flex items-center justify-between border-b px-4 py-2.5 last:border-0">
                <div>
                  <p className="text-sm font-medium">{c.concept}</p>
                  <p className="text-xs text-muted-foreground">
                    {periodLabel(c.period)} · vence {c.dueOn}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm tabular-nums">{formatARS(c.saldoCents)}</p>
                  {c.pagadoCents > 0 && (
                    <p className="text-xs text-muted-foreground">pagó {formatARS(c.pagadoCents)}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}

        <form
          className="mt-6 grid gap-4"
          action={() => cobrar()}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="monto">Monto recibido</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <Input
                id="monto"
                className="pl-7 text-lg tabular-nums"
                inputMode="decimal"
                placeholder="0,00"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <Button type="submit" size="lg" disabled={registrando}>
            {registrando ? 'Registrando…' : 'Registrar pago y emitir recibo'}
          </Button>
        </form>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-lg font-semibold">Cobrar</h1>
      <p className="text-sm text-muted-foreground">Efectivo del cobrador, optimizado para el celular.</p>

      <form
        className="mt-4 flex gap-2"
        action={() => buscar()}
      >
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar por apellido, nombre o DNI…"
          className="flex-1"
        />
        <Button type="submit" disabled={cargando}>
          {cargando ? '…' : 'Buscar'}
        </Button>
      </form>

      {texto === '' && cuentas.length === 0 && !cargando && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Buscá una familia o presioná «Buscar» para ver las cuentas con deuda.
        </p>
      )}

      {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}

      <div className="mt-4 grid gap-2">
        {cuentas.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => abrirCuenta(c)}
            className="flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors hover:bg-accent"
          >
            <div>
              <p className="text-sm font-medium">{c.label ?? `${c.holderApellido}, ${c.holderNombre}`}</p>
              <p className="text-xs text-muted-foreground">{c.holderApellido}, {c.holderNombre}</p>
            </div>
            {c.balanceCents > 0 ? (
              <p className="text-sm font-semibold tabular-nums text-destructive">{formatARS(c.balanceCents)}</p>
            ) : (
              <Badge variant="outline">al día</Badge>
            )}
          </button>
        ))}
        {cuentas.length === 0 && texto !== '' && !cargando && (
          <p className="mt-2 text-center text-sm text-muted-foreground">Sin resultados.</p>
        )}
      </div>
    </div>
  )
}
