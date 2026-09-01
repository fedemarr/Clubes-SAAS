'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, RotateCcw, SearchX } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const ESTADOS = ['activo', 'pendiente_aprobacion', 'prospecto', 'inactivo', 'baja']

/**
 * Panel de filtros colapsable (M15). Envía un GET a la misma página con los
 * mismos name= que antes (q/categoria/estado) para mantener la búsqueda en
 * la URL sin JS: si hay filtros activos arranca abierto, si no, colapsado
 * sobre una sola barra de búsqueda.
 */
export function BuscadorPersonas({
  categorias,
  valores,
}: {
  categorias: { id: string; label: string; sport: string }[]
  valores: { q?: string; categoria?: string; estado?: string }
}) {
  const tieneFiltros = Boolean(valores.q || valores.categoria || valores.estado)
  const [abierto, setAbierto] = useState(tieneFiltros)
  const [q, setQ] = useState(valores.q ?? '')

  return (
    <div className="rounded-xl border bg-card p-3">
      <form method="GET" className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <SearchX className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Apellido, DNI o N° de socio"
              className="pl-9"
            />
          </div>
          {!abierto && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setAbierto(true)}
              className="shrink-0"
            >
              Filtros
              <ChevronDown className="size-3.5" />
            </Button>
          )}
          <Button type="submit" size="sm" className="shrink-0">
            Buscar
          </Button>
        </div>

        {abierto && (
          <div className={cn('grid gap-3 sm:grid-cols-2', tieneFiltros && 'border-t border-border/60 pt-3')}>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Categoría
              </span>
              <select
                name="categoria"
                defaultValue={valores.categoria ?? ''}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              >
                <option value="">Todas las categorías</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.sport} · {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Estado
              </span>
              <select
                name="estado"
                defaultValue={valores.estado ?? ''}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              >
                <option value="">Todos los estados</option>
                {ESTADOS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-2 sm:col-span-2">
              {tieneFiltros && (
                <Button render={<Link href="." />} size="sm" variant="ghost">
                  <RotateCcw className="size-3.5" />
                  Limpiar filtros
                </Button>
              )}
              <Button type="button" size="sm" variant="ghost" onClick={() => setAbierto(false)} className="ml-auto">
                Ocultar filtros
              </Button>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}