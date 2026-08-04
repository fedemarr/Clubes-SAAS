'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { crearCategoria } from '../actions'

export function CategoriaForm({ clubSlug }: { clubSlug: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [abierto, setAbierto] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const form = new FormData(e.currentTarget)
    const result = await crearCategoria(clubSlug, {
      sport: form.get('sport'),
      label: form.get('label'),
      season: form.get('season'),
      birthYearFrom: form.get('birthYearFrom') || undefined,
      birthYearTo: form.get('birthYearTo') || undefined,
    })
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setAbierto(false)
    router.refresh()
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)}>
        + Nueva categoría
      </button>
    )
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', margin: '0.75rem 0' }}>
      <input name="sport" placeholder="Deporte (rugby, hockey...)" required />
      <input name="label" placeholder="Nombre (M12, Sub14...)" required />
      <input name="season" type="number" placeholder="Temporada" defaultValue={new Date().getFullYear()} required />
      <input name="birthYearFrom" type="number" placeholder="Año nac. desde" />
      <input name="birthYearTo" type="number" placeholder="Año nac. hasta" />
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>
        Crear
      </button>
      <button type="button" onClick={() => setAbierto(false)}>
        Cancelar
      </button>
    </form>
  )
}
