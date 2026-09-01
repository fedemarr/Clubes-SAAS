'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { TIPOS_EXPORTACION_INFO, estadosCargo, estadosPago, estadosPersona, type TipoExportacion } from '@/modules/exportador/schemas'

export type ExportarFormProps = {
  clubSlug: string
  teams: { id: string; label: string; sport: string }[]
  sports: string[]
  cuentas: { id: string; label: string | null; titular: string }[]
  puedePersonas: boolean
  puedeCuotas: boolean
}

const estadoLabel: Record<string, string> = {
  pendiente: 'Pendiente',
  parcial: 'Parcial',
  pagado: 'Pagado',
  vencido: 'Vencido',
  anulado: 'Anulado',
  activo: 'Activo',
  inactivo: 'Inactivo',
  prospecto: 'Prospecto',
  pendiente_aprobacion: 'Pendiente de aprobación',
  baja: 'Baja',
  acreditado: 'Acreditado',
  rechazado: 'Rechazado',
  reversado: 'Reversado',
}

const inputCls =
  'flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50'

export function ExportarForm({ clubSlug, teams, sports, cuentas, puedePersonas, puedeCuotas }: ExportarFormProps) {
  const tipos = TIPOS_EXPORTACION_INFO
  const disponibles = (Object.keys(tipos) as TipoExportacion[]).filter((t) => (t === 'personas' ? puedePersonas : puedeCuotas))
  const [tipo, setTipo] = useState<TipoExportacion>(disponibles[0] ?? 'personas')

  const [pPersonas, setPPersonas] = useState({ categoria: '', estado: '', deporte: '', conDeuda: '' })
  const [pMov, setPMov] = useState({ desde: '', hasta: '', fuente: '', estado: '', categoria: '' })
  const [pCuenta, setPCuenta] = useState({ accountId: '', desde: '', hasta: '' })

  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState('')

  const estadosTipo = tipo === 'movimientos' ? [...estadosCargo, ...estadosPago] : estadosPersona

  async function descargar() {
    setError('')
    setBuscando(true)
    try {
      const body: Record<string, unknown> = { club: clubSlug, tipo }
      if (tipo === 'personas') {
        body.personas = {
          categoria: pPersonas.categoria || null,
          estado: pPersonas.estado || null,
          deporte: pPersonas.deporte || null,
          conDeuda: pPersonas.conDeuda || null,
        }
      } else if (tipo === 'movimientos') {
        if (pMov.desde && pMov.hasta && pMov.desde > pMov.hasta) throw new Error('El período desde no puede ser posterior a hasta')
        body.movimientos = {
          desde: pMov.desde || undefined,
          hasta: pMov.hasta || undefined,
          tipo: pMov.fuente || null,
          estado: pMov.estado || null,
          categoria: pMov.categoria || null,
        }
      } else {
        if (!pCuenta.accountId) throw new Error('Elegí una cuenta para exportar su estado')
        if (pCuenta.desde && pCuenta.hasta && pCuenta.desde > pCuenta.hasta) throw new Error('El período desde no puede ser posterior a hasta')
        body.estadoCuenta = {
          accountId: pCuenta.accountId,
          desde: pCuenta.desde || undefined,
          hasta: pCuenta.hasta || undefined,
        }
      }

      const res = await fetch('/api/exportar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? `Error ${res.status}`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${clubSlug}_${tipo}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo exportar')
    } finally {
      setBuscando(false)
    }
  }

  return (
    <div className="mt-6 rounded-xl border bg-card p-5">
      <fieldset className="mb-4">
        <legend className="text-sm font-semibold">Qué exportás</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {disponibles.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                tipo === t ? 'border-primary bg-primary text-primary-foreground' : 'border-input text-muted-foreground hover:bg-muted',
              )}
            >
              {tipos[t].label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{tipos[tipo].descripcion}</p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        {tipo === 'personas' && (
          <>
            <label>
              <Label className="mb-1 block">Categoría</Label>
              <select className={inputCls} value={pPersonas.categoria} onChange={(e) => setPPersonas({ ...pPersonas, categoria: e.target.value })}>
                <option value="">Todas</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.sport} · {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <Label className="mb-1 block">Estado</Label>
              <select className={inputCls} value={pPersonas.estado} onChange={(e) => setPPersonas({ ...pPersonas, estado: e.target.value })}>
                <option value="">Todos</option>
                {estadosPersona.map((s) => (
                  <option key={s} value={s}>
                    {estadoLabel[s] ?? s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <Label className="mb-1 block">Deporte</Label>
              <select className={inputCls} value={pPersonas.deporte} onChange={(e) => setPPersonas({ ...pPersonas, deporte: e.target.value })}>
                <option value="">Todos</option>
                {sports.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <Label className="mb-1 block">Deuda</Label>
              <select className={inputCls} value={pPersonas.conDeuda} onChange={(e) => setPPersonas({ ...pPersonas, conDeuda: e.target.value })}>
                <option value="">Todos</option>
                <option value="si">Con deuda</option>
                <option value="no">Sin deuda</option>
              </select>
            </label>
          </>
        )}

        {tipo === 'movimientos' && (
          <>
            <label>
              <Label className="mb-1 block">Desde</Label>
              <Input type="date" value={pMov.desde} onChange={(e) => setPMov({ ...pMov, desde: e.target.value })} />
            </label>
            <label>
              <Label className="mb-1 block">Hasta</Label>
              <Input type="date" value={pMov.hasta} onChange={(e) => setPMov({ ...pMov, hasta: e.target.value })} />
            </label>
            <label>
              <Label className="mb-1 block">Tipo de movimiento</Label>
              <select className={inputCls} value={pMov.fuente} onChange={(e) => setPMov({ ...pMov, fuente: e.target.value })}>
                <option value="">Todos</option>
                <option value="cargo">Cargo</option>
                <option value="pago">Pago</option>
                <option value="ajuste">Ajuste</option>
                <option value="reversion">Reversión</option>
              </select>
            </label>
            <label>
              <Label className="mb-1 block">Estado</Label>
              <select className={inputCls} value={pMov.estado} onChange={(e) => setPMov({ ...pMov, estado: e.target.value })}>
                <option value="">Todos</option>
                {estadosTipo.map((s) => (
                  <option key={s} value={s}>
                    {estadoLabel[s] ?? s}
                  </option>
                ))}
              </select>
            </label>
            <label className="sm:col-span-2">
              <Label className="mb-1 block">Categoría (filtra por cuenta del grupo familiar)</Label>
              <select className={inputCls} value={pMov.categoria} onChange={(e) => setPMov({ ...pMov, categoria: e.target.value })}>
                <option value="">Todas</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.sport} · {t.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {tipo === 'estado_cuenta' && (
          <>
            <label className="sm:col-span-2">
              <Label className="mb-1 block">Cuenta del grupo familiar</Label>
              <select className={inputCls} value={pCuenta.accountId} onChange={(e) => setPCuenta({ ...pCuenta, accountId: e.target.value })}>
                <option value="">Elegí una cuenta</option>
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.titular}
                    {c.label ? ` · ${c.label}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <Label className="mb-1 block">Desde</Label>
              <Input type="date" value={pCuenta.desde} onChange={(e) => setPCuenta({ ...pCuenta, desde: e.target.value })} />
            </label>
            <label>
              <Label className="mb-1 block">Hasta</Label>
              <Input type="date" value={pCuenta.hasta} onChange={(e) => setPCuenta({ ...pCuenta, hasta: e.target.value })} />
            </label>
          </>
        )}
      </div>

      {error && <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className="mt-5 flex items-center justify-end">
        <Button onClick={descargar} disabled={buscando}>
          <Download data-icon="inline-start" />
          {buscando ? 'Generando…' : 'Descargar Excel'}
        </Button>
      </div>
    </div>
  )
}