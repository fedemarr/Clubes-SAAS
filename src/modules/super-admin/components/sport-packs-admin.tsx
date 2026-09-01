'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { guardarSportPacks } from '../actions'
import type { SportPackEntry } from '../schemas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

type DivisionEntry = { sport: string; label: string; season: number }

function parseLista(texto: string): string[] {
  return texto
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 30)
}

function ListaChips({ items, className }: { items: string[]; className?: string }) {
  if (items.length === 0) return <span className="text-xs text-muted-foreground/70">—</span>
  return (
    <div className={`flex flex-wrap gap-1 ${className ?? ''}`}>
      {items.map((i) => (
        <Badge key={i} variant="secondary" className="text-xs font-normal">
          {i}
        </Badge>
      ))}
    </div>
  )
}

export function SportPacksAdmin({
  slug,
  inicial,
  categorias,
}: {
  slug: string
  inicial: SportPackEntry[]
  categorias: DivisionEntry[]
}) {
  const router = useRouter()
  const [packs, setPacks] = useState<SportPackEntry[]>(inicial)
  const [editando, setEditando] = useState<string | null>(null) // key being edited
  const [agregando, setAgregando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Edit form state
  const [editLabel, setEditLabel] = useState('')
  const [editPosiciones, setEditPosiciones] = useState('')
  const [editTipos, setEditTipos] = useState('')

  // Add form state
  const [addKey, setAddKey] = useState('')
  const [addLabel, setAddLabel] = useState('')

  const divisiones = useMemo(() => {
    const map = new Map<string, DivisionEntry[]>()
    for (const d of categorias) {
      const arr = map.get(d.sport) ?? []
      arr.push(d)
      map.set(d.sport, arr)
    }
    return map
  }, [categorias])

  function iniciarEdicion(p: SportPackEntry) {
    setEditando(p.key)
    setEditLabel(p.label)
    setEditPosiciones(p.posiciones.join('\n'))
    setEditTipos(p.tiposPartido.join('\n'))
    setAgregando(false)
    setError(null)
  }

  async function guardar() {
    if (!editando) return
    setError(null)
    setSubmitting(true)
    const entry = packs.find((p) => p.key === editando)
    if (!entry) {
      setSubmitting(false)
      return
    }
    const updated = packs.map((p) =>
      p.key === editando
        ? { ...p, label: editLabel || editando, posiciones: parseLista(editPosiciones), tiposPartido: parseLista(editTipos) }
        : p,
    )
    const res = await guardarSportPacks(slug, { deportes: updated })
    setSubmitting(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setPacks(updated)
    setEditando(null)
    router.refresh()
  }

  async function agregar() {
    const key = addKey.trim().toLowerCase()
    if (!key || !addLabel.trim()) return
    if (packs.some((p) => p.key === key)) {
      setError(`Ya existe un deporte con la clave "${key}".`)
      return
    }
    setError(null)
    setSubmitting(true)
    const updated = [...packs, { key, label: addLabel.trim(), posiciones: [], tiposPartido: [] }]
    const res = await guardarSportPacks(slug, { deportes: updated })
    setSubmitting(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setPacks(updated)
    setAgregando(false)
    setAddKey('')
    setAddLabel('')
    router.refresh()
  }

  async function eliminar(key: string) {
    setSubmitting(true)
    const updated = packs.filter((p) => p.key !== key)
    const res = await guardarSportPacks(slug, { deportes: updated })
    setSubmitting(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setPacks(updated)
    setEditando(null)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</div>
      )}

      {packs.map((p) => {
        const isActive = editando === p.key
        const divs = divisiones.get(p.key) ?? []

        return (
          <div key={p.key} className="rounded-xl border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold capitalize text-primary">
                  {p.label[0] ?? p.key[0]}
                </span>
                <div>
                  <h3 className="text-sm font-semibold">{p.label}</h3>
                  <span className="font-mono text-xs text-muted-foreground">{p.key}</span>
                </div>
              </div>
              {!isActive && (
                <Button variant="ghost" size="icon-sm" onClick={() => iniciarEdicion(p)} title="Editar">
                  <Pencil className="size-4" />
                </Button>
              )}
            </div>

            {/* Divisiones (read-only) */}
            <div className="mt-3">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Divisiones ({divs.length})
              </p>
              {divs.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {divs.map((d) => (
                    <span key={`${d.label}-${d.season}`} className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5 text-xs">
                      <span className="font-medium">{d.label}</span>
                      <span className="text-muted-foreground">· {d.season}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/70">No hay categorías de este deporte.</p>
              )}
            </div>

            {isActive ? (
              /* Edit mode */
              <div className="mt-4 space-y-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">Nombre</Label>
                  <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Posiciones (una por línea o coma)</Label>
                  <textarea
                    value={editPosiciones}
                    onChange={(e) => setEditPosiciones(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Tipos de partido (una por línea o coma)</Label>
                  <textarea
                    value={editTipos}
                    onChange={(e) => setEditTipos(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => void guardar()} disabled={submitting}>
                    <Check className="size-3.5" />
                    {submitting ? 'Guardando…' : 'Guardar'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditando(null)} disabled={submitting}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="ml-auto"
                    onClick={() => void eliminar(p.key)}
                    disabled={submitting}
                  >
                    <Trash2 className="size-3.5" />
                    Eliminar
                  </Button>
                </div>
              </div>
            ) : (
              /* View chips */
              <div className="mt-3 space-y-2">
                <div>
                  <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Posiciones</p>
                  <ListaChips items={p.posiciones} />
                </div>
                <div>
                  <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Tipos de partido</p>
                  <ListaChips items={p.tiposPartido} />
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Add new sport */}
      {agregando ? (
        <div className="rounded-xl border border-dashed bg-card p-5">
          <h3 className="text-sm font-semibold">Agregar deporte</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label className="text-xs">Clave (única, en inglés)</Label>
              <Input
                value={addKey}
                onChange={(e) => setAddKey(e.target.value)}
                placeholder="ej. basquet"
                className="h-8 font-mono text-sm"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Nombre para mostrar</Label>
              <Input
                value={addLabel}
                onChange={(e) => setAddLabel(e.target.value)}
                placeholder="ej. Básquet"
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" onClick={() => void agregar()} disabled={!addKey.trim() || !addLabel.trim() || submitting}>
              <Check className="size-3.5" />
              {submitting ? 'Guardando…' : 'Agregar'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAgregando(false)} disabled={submitting}>
              <X className="size-3.5" />
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setAgregando(true)
            setEditando(null)
            setError(null)
            setAddKey('')
            setAddLabel('')
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-4 text-sm text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
        >
          <Plus className="size-4" />
          Agregar deporte
        </button>
      )}
    </div>
  )
}