'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { buscarPersonasParaVinculo, crearVinculo, unificarCuentaCorriente } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Resultado = { id: string; nombre: string; docNumber: string | null }

export function VinculoForm({ clubSlug, personId }: { clubSlug: string; personId: string }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState<Resultado[]>([])
  const [elegido, setElegido] = useState<Resultado | null>(null)
  const [kind, setKind] = useState<'tutor_de' | 'conyuge_de' | 'hermano_de'>('tutor_de')
  const [error, setError] = useState<string | null>(null)
  const [ofertaUnificar, setOfertaUnificar] = useState<{ cuentaTutorId: string | null } | null>(null)

  async function buscar(valor: string) {
    setQ(valor)
    setElegido(null)
    if (valor.trim().length < 2) {
      setResultados([])
      return
    }
    const r = await buscarPersonasParaVinculo(clubSlug, valor)
    if (r.ok) setResultados(r.data.filter((p) => p.id !== personId))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!elegido) {
      setError('Elegí una persona de la lista')
      return
    }
    const result = await crearVinculo(clubSlug, { personId, relatedPersonId: elegido.id, kind })
    if (!result.ok) {
      setError(result.error)
      return
    }
    if (result.data.ofrecerUnificarCuenta) {
      setOfertaUnificar({ cuentaTutorId: result.data.cuentaTutorId })
      return
    }
    router.refresh()
  }

  async function unificar() {
    if (!ofertaUnificar?.cuentaTutorId) return
    await unificarCuentaCorriente(clubSlug, personId, ofertaUnificar.cuentaTutorId)
    setOfertaUnificar(null)
    router.refresh()
  }

  if (ofertaUnificar) {
    return (
      <div className="mt-4 rounded-xl border p-4">
        {ofertaUnificar.cuentaTutorId ? (
          <>
            <p className="text-sm">
              El tutor ya tiene una cuenta corriente familiar. ¿Unificar esta persona a esa cuenta?
            </p>
            <div className="mt-3 flex gap-2">
              <Button type="button" size="sm" onClick={unificar}>
                Sí, unificar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setOfertaUnificar(null)
                  router.refresh()
                }}
              >
                No por ahora
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm">
              El tutor todavía no tiene cuenta corriente propia (se crea en el módulo de cuotas).
            </p>
            <div className="mt-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setOfertaUnificar(null)
                  router.refresh()
                }}
              >
                Entendido
              </Button>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 grid max-w-md gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="vinculo-kind">Tipo de vínculo</Label>
        <Select value={kind} onValueChange={(v) => setKind((v ?? 'tutor_de') as typeof kind)}>
          <SelectTrigger id="vinculo-kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tutor_de">Es tutor de…</SelectItem>
            <SelectItem value="conyuge_de">Es cónyuge de…</SelectItem>
            <SelectItem value="hermano_de">Es hermano/a de…</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="vinculo-busqueda">Buscar persona</Label>
        <Input
          id="vinculo-busqueda"
          type="search"
          placeholder="Apellido o DNI"
          value={q}
          onChange={(e) => buscar(e.target.value)}
        />
        {resultados.length > 0 && !elegido && (
          <div className="overflow-hidden rounded-lg border bg-card">
            {resultados.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setElegido(r)
                  setResultados([])
                  setQ(r.nombre)
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
              >
                <span className="font-medium">{r.nombre}</span>
                {r.docNumber && <span className="text-xs text-muted-foreground">{r.docNumber}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm">
          Crear vínculo
        </Button>
        {elegido && (
          <Button type="button" size="sm" variant="ghost" onClick={() => { setElegido(null); setQ('') }}>
            Limpiar
          </Button>
        )}
      </div>
    </form>
  )
}
