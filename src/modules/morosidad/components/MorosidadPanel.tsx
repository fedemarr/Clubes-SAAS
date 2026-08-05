'use client'

import { useMemo, useState } from 'react'
import {
  crearPlanDePago,
  ejecutarCobranza,
  eliminarReglaCobranza,
  guardarPlantilla,
  guardarReglaCobranza,
  resolverSugerencia,
} from '../actions'
import type { ResultadoEjecucionCobranza } from '../runner'
import type { ReglaCobranza } from '../service'
import type { CanalCobranza } from '../schemas'
import { formatARS } from '@/lib/money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/empty-state'
import { Play, Settings2, FileText, CalendarClock, Check } from 'lucide-react'

export type PlantillaVM = { id: string; key: string; name: string; body: string }
export type PlanVM = {
  id: string
  accountId: string
  holderApellido: string
  holderNombre: string
  totalCents: number
  cantidadCuotas: number
  montoCuotaCents: number
  primeraFecha: string
  status: string
  motivo: string | null
  createdAt: string
  pagadoDesdeInicioCents: number
}
export type DeudorVM = { accountId: string; label: string; deudaCents: number }
export type SugerenciaVM = {
  id: string
  accountId: string
  holderApellido: string
  holderNombre: string
  deudaCents: number
  ruleName: string | null
  deliveredAt: string
}

const CANALES: { value: CanalCobranza; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'mail', label: 'Mail' },
  { value: 'coordinador', label: 'Aviso al coordinador' },
  { value: 'suspension', label: 'Sugerencia de suspensión' },
]

const canalBadge: Record<CanalCobranza, { label: string; variant: 'default' | 'outline' | 'secondary' | 'destructive' }> = {
  whatsapp: { label: 'WhatsApp', variant: 'default' },
  mail: { label: 'Mail', variant: 'outline' },
  coordinador: { label: 'Coordinador', variant: 'secondary' },
  suspension: { label: 'Suspensión', variant: 'destructive' },
}

export function MorosidadPanel({
  clubSlug,
  puedeConfigurar,
  reglas: reglasIniciales,
  plantillas: plantillasIniciales,
  planes,
  deudores,
  sugerencias: sugerenciasIniciales,
}: {
  clubSlug: string
  puedeConfigurar: boolean
  reglas: ReglaCobranza[]
  plantillas: PlantillaVM[]
  planes: PlanVM[]
  deudores: DeudorVM[]
  sugerencias: SugerenciaVM[]
}) {
  // ── Ejecutar cobranza ──────────────────────────────────────────────────
  const [ejecutando, setEjecutando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoEjecucionCobranza | null>(null)
  const [errorEjecutar, setErrorEjecutar] = useState<string | null>(null)

  async function onEjecutar() {
    setErrorEjecutar(null)
    setResultado(null)
    setEjecutando(true)
    const r = await ejecutarCobranza(clubSlug)
    setEjecutando(false)
    if (!r.ok) {
      setErrorEjecutar(r.error)
      return
    }
    setResultado(r.data)
  }

  // ── Reglas ─────────────────────────────────────────────────────────────
  const [reglas, setReglas] = useState(reglasIniciales)
  const [editandoRegla, setEditandoRegla] = useState<ReglaCobranza | null>(null)
  const [formRegla, setFormRegla] = useState<{
    name: string
    dias: string
    channel: CanalCobranza
    templateKey: string
    dedupeDias: string
  }>({ name: '', dias: '5', channel: 'whatsapp', templateKey: '', dedupeDias: '7' })
  const [guardandoRegla, setGuardandoRegla] = useState(false)
  const [errorRegla, setErrorRegla] = useState<string | null>(null)

  function abrirRegla(r: ReglaCobranza | null) {
    setEditandoRegla(r)
    setErrorRegla(null)
    setFormRegla(
      r
        ? {
            name: r.name,
            dias: String(r.dias),
            channel: r.channel,
            templateKey: r.templateKey ?? '',
            dedupeDias: String(r.dedupeDias),
          }
        : { name: '', dias: '5', channel: 'whatsapp', templateKey: '', dedupeDias: '7' },
    )
  }

  async function onGuardarRegla() {
    setErrorRegla(null)
    setGuardandoRegla(true)
    const r = await guardarReglaCobranza(clubSlug, {
      id: editandoRegla?.id,
      name: formRegla.name,
      dias: Number(formRegla.dias),
      channel: formRegla.channel,
      templateKey: formRegla.templateKey === '' ? null : formRegla.templateKey,
      dedupeDias: Number(formRegla.dedupeDias),
      enabled: true,
    })
    setGuardandoRegla(false)
    if (!r.ok) {
      setErrorRegla(r.error)
      return
    }
    if (editandoRegla) {
      setReglas((prev) =>
        prev.map((x) =>
          x.id === r.data.id
            ? { ...x, name: formRegla.name, dias: Number(formRegla.dias), channel: formRegla.channel, templateKey: formRegla.templateKey === '' ? null : formRegla.templateKey, dedupeDias: Number(formRegla.dedupeDias), enabled: true }
            : x,
        ),
      )
    } else {
      setReglas((prev) => [
        ...prev,
        {
          id: r.data.id,
          name: formRegla.name,
          dias: Number(formRegla.dias),
          channel: formRegla.channel,
          templateKey: formRegla.templateKey === '' ? null : formRegla.templateKey,
          dedupeDias: Number(formRegla.dedupeDias),
          enabled: true,
        },
      ])
    }
    abrirRegla(null)
  }

  async function onDesactivarRegla(id: string) {
    const r = await eliminarReglaCobranza(clubSlug, { id })
    if (!r.ok) {
      setErrorRegla(r.error)
      return
    }
    setReglas((prev) => prev.map((x) => (x.id === id ? { ...x, enabled: false } : x)))
  }

  // ── Plantillas ─────────────────────────────────────────────────────────
  const [plantillas, setPlantillas] = useState(plantillasIniciales)
  const [editandoPlantilla, setEditandoPlantilla] = useState<PlantillaVM | null>(null)
  const [formPlantilla, setFormPlantilla] = useState<{ key: string; name: string; body: string }>({
    key: '',
    name: '',
    body: '',
  })
  const [guardandoPlantilla, setGuardandoPlantilla] = useState(false)
  const [errorPlantilla, setErrorPlantilla] = useState<string | null>(null)

  function abrirPlantilla(p: PlantillaVM | null) {
    setEditandoPlantilla(p)
    setErrorPlantilla(null)
    setFormPlantilla(
      p ? { key: p.key, name: p.name, body: p.body } : { key: '', name: '', body: 'Hola {{nombre}}, te recordamos que tenés una deuda de {{monto}} con el club. Pagala acá: {{link_pago}}' },
    )
  }

  async function onGuardarPlantilla() {
    setErrorPlantilla(null)
    setGuardandoPlantilla(true)
    const r = await guardarPlantilla(clubSlug, {
      id: editandoPlantilla?.id,
      key: formPlantilla.key,
      name: formPlantilla.name,
      body: formPlantilla.body,
    })
    setGuardandoPlantilla(false)
    if (!r.ok) {
      setErrorPlantilla(r.error)
      return
    }
    const fila: PlantillaVM = {
      id: r.data.id,
      key: formPlantilla.key,
      name: formPlantilla.name,
      body: formPlantilla.body,
    }
    setPlantillas((prev) => {
      const existe = prev.some((x) => x.id === r.data.id)
      return existe ? prev.map((x) => (x.id === r.data.id ? fila : x)) : [...prev, fila]
    })
    abrirPlantilla(null)
  }

  // ── Planes de pago ─────────────────────────────────────────────────────
  const [formPlan, setFormPlan] = useState<{ accountId: string; cuotas: string; primeraFecha: string; motivo: string }>({
    accountId: '',
    cuotas: '4',
    primeraFecha: '',
    motivo: '',
  })
  const [guardandoPlan, setGuardandoPlan] = useState(false)
  const [errorPlan, setErrorPlan] = useState<string | null>(null)
  const [planCreado, setPlanCreado] = useState<string | null>(null)

  const deudoresOrdenados = useMemo(() => [...deudores].sort((a, b) => b.deudaCents - a.deudaCents), [deudores])
  const deudaSeleccionada = deudores.find((d) => d.accountId === formPlan.accountId)?.deudaCents ?? 0

  async function onCrearPlan() {
    setErrorPlan(null)
    setPlanCreado(null)
    if (!formPlan.accountId || !formPlan.primeraFecha) {
      setErrorPlan('Elegí la cuenta y la fecha de la primera cuota.')
      return
    }
    setGuardandoPlan(true)
    const r = await crearPlanDePago(clubSlug, {
      accountId: formPlan.accountId,
      totalCents: deudaSeleccionada,
      cuotas: Number(formPlan.cuotas),
      primeraFecha: formPlan.primeraFecha,
      motivo: formPlan.motivo === '' ? null : formPlan.motivo,
    })
    setGuardandoPlan(false)
    if (!r.ok) {
      setErrorPlan(r.error)
      return
    }
    setPlanCreado(`Plan creado por ${formatARS(deudaSeleccionada)} en ${formPlan.cuotas} cuotas.`)
    setFormPlan((prev) => ({ ...prev, accountId: '', motivo: '' }))
  }

  // ── Sugerencias ────────────────────────────────────────────────────────
  const [sugerencias, setSugerencias] = useState(sugerenciasIniciales)
  const [resolviendo, setResolviendo] = useState<string | null>(null)
  const [errorSugerencia, setErrorSugerencia] = useState<string | null>(null)

  async function onResolverSugerencia(id: string) {
    setErrorSugerencia(null)
    setResolviendo(id)
    const r = await resolverSugerencia(clubSlug, { id })
    setResolviendo(null)
    if (!r.ok) {
      setErrorSugerencia(r.error)
      return
    }
    setSugerencias((prev) => prev.filter((s) => s.id !== id))
  }

  const esMensaje = formRegla.channel === 'whatsapp' || formRegla.channel === 'mail'

  return (
    <div className="mt-10 space-y-10">
      {/* Motor de cobranza */}
      <section>
        <h2 className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Play className="size-3.5" /> Motor de cobranza
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Corre ahora las reglas activas contra todos los deudores. Cada contacto queda registrado para no
          duplicar mensajes.
        </p>
        <div className="flex items-center gap-3">
          <Button onClick={onEjecutar} disabled={ejecutando}>
            {ejecutando ? 'Evaluando…' : 'Ejecutar cobranza'}
          </Button>
          {errorEjecutar && <p role="alert" className="text-sm text-destructive">{errorEjecutar}</p>}
        </div>
        {resultado && (
          <div className="mt-3 rounded-lg border border-green-600/30 bg-green-50 p-3 text-sm">
            <p>
              <span className="font-medium">{resultado.mensajes} mensajes</span> ·{' '}
              {resultado.avisosCoordinador} avisos a coordinadores · {resultado.sugerencias} sugerencias de
              suspensión. <span className="text-muted-foreground">{resultado.omitidos} omitidos</span>.
            </p>
            {Object.keys(resultado.porMotivo).length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {Object.entries(resultado.porMotivo)
                  .map(([motivo, n]) => `${motivo}: ${n}`)
                  .join(' · ')}
              </p>
            )}
          </div>
        )}
      </section>

      {/* Reglas */}
      <section>
        <h2 className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Settings2 className="size-3.5" /> Reglas de cobranza
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          {puedeConfigurar
            ? 'Configurá disparadores sin tocar código. La suspensión solo sugiere: nunca actúa sola.'
            : 'Las reglas las configura el tesorero.'}
        </p>

        <div className="overflow-hidden rounded-lg border">
          {reglas.length === 0 ? (
            <div className="p-4">
              <EmptyState title="Sin reglas configuradas." className="py-6" />
            </div>
          ) : (
            reglas
              .slice()
              .sort((a, b) => a.dias - b.dias)
              .map((r) => {
                const badge = canalBadge[r.channel]
                return (
                  <div key={r.id} className="flex items-center justify-between gap-3 border-b px-3 py-2.5 last:border-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {r.name}
                        {!r.enabled && <span className="ml-2 text-xs text-muted-foreground">(desactivada)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        A los {r.dias} días · dedupe {r.dedupeDias} días
                        {r.templateKey && <> · plantilla {r.templateKey}</>}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                      {puedeConfigurar && (
                        <>
                          {r.enabled ? (
                            <Button size="sm" variant="ghost" onClick={() => onDesactivarRegla(r.id)}>
                              Desactivar
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                guardarReglaCobranza(clubSlug, {
                                  id: r.id,
                                  name: r.name,
                                  dias: r.dias,
                                  channel: r.channel,
                                  templateKey: r.templateKey,
                                  dedupeDias: r.dedupeDias,
                                  enabled: true,
                                })
                              }
                            >
                              Activar
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => abrirRegla(r)}>
                            Editar
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })
          )}
        </div>

        {puedeConfigurar && (
          <div className="mt-4 rounded-lg border p-4">
            {!editandoRegla ? (
              <Button size="sm" variant="outline" onClick={() => abrirRegla(null)}>
                + Nueva regla
              </Button>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
                <div className="lg:col-span-2 grid gap-1.5">
                  <Label htmlFor="regla-name">Nombre</Label>
                  <Input id="regla-name" value={formRegla.name} onChange={(e) => setFormRegla((p) => ({ ...p, name: e.target.value }))} placeholder="Recordatorio amable" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="regla-dias">Días desde vencimiento</Label>
                  <Input id="regla-dias" type="number" min={0} value={formRegla.dias} onChange={(e) => setFormRegla((p) => ({ ...p, dias: e.target.value }))} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Canal</Label>
                  <Select value={formRegla.channel} onValueChange={(v) => setFormRegla((p) => ({ ...p, channel: v as CanalCobranza, templateKey: v === 'whatsapp' || v === 'mail' ? p.templateKey : '' }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CANALES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {esMensaje && (
                  <div className="grid gap-1.5">
                    <Label>Plantilla</Label>
                    <Select value={formRegla.templateKey} onValueChange={(v) => setFormRegla((p) => ({ ...p, templateKey: (v ?? '') === '__none__' ? '' : (v ?? '') }))}>
                      <SelectTrigger><SelectValue placeholder="Elegí plantilla" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Sin plantilla —</SelectItem>
                        {plantillas.map((p) => (
                          <SelectItem key={p.id} value={p.key}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid gap-1.5">
                  <Label htmlFor="regla-dedupe">Dedupe (días)</Label>
                  <Input id="regla-dedupe" type="number" min={1} value={formRegla.dedupeDias} onChange={(e) => setFormRegla((p) => ({ ...p, dedupeDias: e.target.value }))} />
                </div>
                <div className="flex items-center gap-2">
                  <Button onClick={onGuardarRegla} disabled={guardandoRegla || formRegla.name.trim() === ''}>
                    {guardandoRegla ? 'Guardando…' : editandoRegla ? 'Guardar cambios' : 'Crear regla'}
                  </Button>
                  <Button variant="ghost" onClick={() => abrirRegla(null)}>Cancelar</Button>
                </div>
              </div>
            )}
            {errorRegla && <p role="alert" className="mt-2 text-sm text-destructive">{errorRegla}</p>}
          </div>
        )}
      </section>

      {/* Plantillas */}
      <section>
        <h2 className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <FileText className="size-3.5" /> Plantillas de mensaje
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Variables disponibles: {'{{nombre}}'}, {'{{apellido}}'}, {'{{monto}}'}, {'{{link_pago}}'}.
        </p>

        <div className="overflow-hidden rounded-lg border">
          {plantillas.length === 0 ? (
            <div className="p-4">
              <EmptyState title="Sin plantillas." className="py-6" />
            </div>
          ) : (
            plantillas.map((p) => (
              <div key={p.id} className="flex items-start justify-between gap-3 border-b px-3 py-2.5 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{p.name} <span className="ml-1 font-mono text-xs text-muted-foreground">{p.key}</span></p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.body}</p>
                </div>
                {puedeConfigurar && (
                  <Button size="sm" variant="ghost" className="shrink-0" onClick={() => abrirPlantilla(p)}>
                    Editar
                  </Button>
                )}
              </div>
            ))
          )}
        </div>

        {puedeConfigurar && (
          <div className="mt-4 rounded-lg border p-4">
            {!editandoPlantilla ? (
              <Button size="sm" variant="outline" onClick={() => abrirPlantilla(null)}>
                + Nueva plantilla
              </Button>
            ) : (
              <div className="grid gap-3">
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="plantilla-key">Clave (minúsculas, guión bajo)</Label>
                    <Input id="plantilla-key" className="font-mono text-xs" value={formPlantilla.key} onChange={(e) => setFormPlantilla((p) => ({ ...p, key: e.target.value }))} placeholder="recordatorio_amable" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="plantilla-name">Nombre</Label>
                    <Input id="plantilla-name" value={formPlantilla.name} onChange={(e) => setFormPlantilla((p) => ({ ...p, name: e.target.value }))} />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="plantilla-body">Texto</Label>
                  <textarea
                    id="plantilla-body"
                    rows={4}
                    className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm"
                    value={formPlantilla.body}
                    onChange={(e) => setFormPlantilla((p) => ({ ...p, body: e.target.value }))}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button onClick={onGuardarPlantilla} disabled={guardandoPlantilla || formPlantilla.body.trim() === '' || formPlantilla.key.trim() === ''}>
                    {guardandoPlantilla ? 'Guardando…' : editandoPlantilla ? 'Guardar cambios' : 'Crear plantilla'}
                  </Button>
                  <Button variant="ghost" onClick={() => abrirPlantilla(null)}>Cancelar</Button>
                </div>
              </div>
            )}
            {errorPlantilla && <p role="alert" className="mt-2 text-sm text-destructive">{errorPlantilla}</p>}
          </div>
        )}
      </section>

      {/* Sugerencias de suspensión */}
      {puedeConfigurar && sugerencias.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Sugerencias de suspensión
          </h2>
          <div className="overflow-hidden rounded-lg border">
            {sugerencias.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 border-b px-3 py-2.5 last:border-0">
                <div>
                  <p className="text-sm font-medium">{s.holderApellido}, {s.holderNombre}</p>
                  <p className="text-xs text-muted-foreground">{s.ruleName ?? 'Regla de suspensión'} · {formatARS(s.deudaCents)}</p>
                </div>
                <Button size="sm" variant="outline" disabled={resolviendo === s.id} onClick={() => onResolverSugerencia(s.id)}>
                  <Check className="mr-1 size-3.5" /> {resolviendo === s.id ? 'Cerrando…' : 'Dar por revisada'}
                </Button>
              </div>
            ))}
          </div>
          {errorSugerencia && <p role="alert" className="mt-2 text-sm text-destructive">{errorSugerencia}</p>}
        </section>
      )}

      {/* Planes de pago */}
      {puedeConfigurar && (
        <section>
          <h2 className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <CalendarClock className="size-3.5" /> Planes de pago
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Divide la deuda actual de una cuenta en cuotas mensuales.
          </p>

          <div className="rounded-lg border p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
              <div className="grid gap-1.5 lg:col-span-2">
                <Label>Cuenta</Label>
                <Select value={formPlan.accountId} onValueChange={(v) => setFormPlan((p) => ({ ...p, accountId: v ?? '' }))}>
                  <SelectTrigger><SelectValue placeholder="Elegí la cuenta" /></SelectTrigger>
                  <SelectContent>
                    {deudoresOrdenados.map((d) => (
                      <SelectItem key={d.accountId} value={d.accountId}>
                        {d.label} · {formatARS(d.deudaCents)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="plan-cuotas">Cuotas</Label>
                <Input id="plan-cuotas" type="number" min={1} max={24} value={formPlan.cuotas} onChange={(e) => setFormPlan((p) => ({ ...p, cuotas: e.target.value }))} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="plan-fecha">Primera cuota</Label>
                <Input id="plan-fecha" type="date" value={formPlan.primeraFecha} onChange={(e) => setFormPlan((p) => ({ ...p, primeraFecha: e.target.value }))} />
              </div>
              <Button onClick={onCrearPlan} disabled={guardandoPlan || !formPlan.accountId}>
                {guardandoPlan ? 'Creando…' : 'Crear plan'}
              </Button>
            </div>
            {deudaSeleccionada > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {formatARS(deudaSeleccionada)} en {formPlan.cuotas} cuotas ≈ {formatARS(Math.ceil(deudaSeleccionada / Math.max(1, Number(formPlan.cuotas))))} por cuota.
              </p>
            )}
            {errorPlan && <p role="alert" className="mt-2 text-sm text-destructive">{errorPlan}</p>}
            {planCreado && <p role="status" className="mt-2 text-sm text-green-700">{planCreado}</p>}
          </div>

          {planes.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-lg border">
              {planes.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 border-b px-3 py-2.5 last:border-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.holderApellido}, {p.holderNombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.cantidadCuotas} cuotas · desde {p.primeraFecha}
                      {p.motivo && <> · {p.motivo}</>}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium tabular-nums">{formatARS(p.totalCents)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatARS(p.pagadoDesdeInicioCents)} pagado · {p.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
