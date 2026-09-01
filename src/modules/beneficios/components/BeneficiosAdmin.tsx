'use client'

import { useState } from 'react'
import { Gift, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { borrarBeneficio, guardarBeneficio } from '../actions'
import type { Beneficio } from '../queries'
import { Button } from '@/components/ui/button'

const ICONO_LABEL: Record<string, string> = {
  gift: 'Regalo',
  star: 'Estrella',
  percent: 'Descuento',
  ticket: 'Entrada',
  car: 'Estacionamiento',
  heart: 'Corazón',
  shield: 'Escudo',
  award: 'Premio',
  '': 'Icono por defecto',
}

type Formulario = {
  id?: string
  title: string
  description: string
  icon: string
  sort: number
  active: boolean
}

const VACIO: Formulario = { title: '', description: '', icon: 'gift', sort: 0, active: true }

function Fila({ clubSlug, beneficio, onEditar }: {
  clubSlug: string
  beneficio: Beneficio
  onEditar: (b: Beneficio) => void
}) {
  const [borrando, setBorrando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function borrar() {
    setBorrando(true)
    setError(null)
    const r = await borrarBeneficio(clubSlug, { id: beneficio.id })
    setBorrando(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    window.location.reload()
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary/10">
            <Gift className="size-3.5 text-primary" />
          </span>
          {beneficio.title}
        </p>
        {beneficio.description && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{beneficio.description}</p>
        )}
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Orden {beneficio.sort} · {beneficio.active ? 'Visible en el portal' : 'Oculto'}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onEditar(beneficio)}>
          <Pencil className="size-3.5" />
          Editar
        </Button>
        <Button variant="destructive" size="sm" onClick={borrar} disabled={borrando}>
          {borrando ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </li>
  )
}

export function BeneficiosAdmin({ clubSlug, beneficios }: { clubSlug: string; beneficios: Beneficio[] }) {
  const [form, setForm] = useState<Formulario | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    if (!form) return
    setGuardando(true)
    setError(null)
    const r = await guardarBeneficio(clubSlug, form)
    setGuardando(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    setForm(null)
    window.location.reload()
  }

  return (
    <div className="grid gap-4">
      <Button variant="outline" onClick={() => setForm(form ? null : VACIO)}>
        <Plus className="size-4" />
        {form ? 'Cancelar' : 'Nuevo beneficio'}
      </Button>

      {form && (
        <div className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm">
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Título</span>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              maxLength={160}
              className="rounded-lg border bg-background px-3 py-2"
              placeholder="60% en estacionamiento"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Descripción</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              maxLength={500}
              rows={2}
              className="rounded-lg border bg-background px-3 py-2"
              placeholder="Descuento para socios al día con la cuota"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-muted-foreground">Icono</span>
              <select
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
                className="rounded-lg border bg-background px-2 py-2"
              >
                {Object.entries(ICONO_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-muted-foreground">Orden</span>
              <input
                type="number"
                min={0}
                max={999}
                value={form.sort}
                onChange={(e) => setForm({ ...form, sort: Number(e.target.value) })}
                className="rounded-lg border bg-background px-3 py-2"
              />
            </label>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="size-4"
              />
              <span className="text-xs font-medium text-muted-foreground">Visible en el portal</span>
            </label>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={guardar} disabled={guardando || !form.title.trim()}>
              {guardando && <Loader2 className="size-4 animate-spin" />}
              {form.id ? 'Guardar cambios' : 'Crear beneficio'}
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </div>
      )}

      {beneficios.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Todavía no hay beneficios. Agregá el primero para que aparezca en el portal de los socios.
        </p>
      ) : (
        <ul className="grid gap-3">
          {beneficios.map((b) => (
            <Fila key={b.id} clubSlug={clubSlug} beneficio={b} onEditar={(beneficio) => setForm({
              id: beneficio.id,
              title: beneficio.title,
              description: beneficio.description ?? '',
              icon: beneficio.icon ?? 'gift',
              sort: beneficio.sort,
              active: beneficio.active,
            })} />
          ))}
        </ul>
      )}
    </div>
  )
}