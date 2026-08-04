'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { crearEvento, actualizarEvento } from '../actions'

type Categoria = { id: string; label: string; sport: string; season: number }
type EventoInicial = {
  id: string
  kind: string
  teamId: string | null
  title: string
  location: string | null
  startsAt: Date
  endsAt: Date | null
  opponent: string | null
}

function toDatetimeLocal(date: Date | string): string {
  const d = new Date(date)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function EventoForm({
  clubSlug,
  categorias,
  allowSinCategoria,
  initial,
}: {
  clubSlug: string
  categorias: Categoria[]
  allowSinCategoria: boolean
  initial?: EventoInicial
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [kind, setKind] = useState(initial?.kind ?? 'entrenamiento')
  const [recurrente, setRecurrente] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const form = new FormData(e.currentTarget)
    const startsAt = new Date(String(form.get('startsAt'))).toISOString()
    const endsAtVal = form.get('endsAt')
    const endsAt = endsAtVal ? new Date(String(endsAtVal)).toISOString() : undefined
    const teamIdVal = form.get('teamId') || null

    const payload = {
      kind,
      teamId: teamIdVal,
      title: form.get('title') || '',
      location: form.get('location') || undefined,
      startsAt,
      endsAt,
      opponent: kind === 'partido' ? (form.get('opponent') || undefined) : undefined,
      ...(initial ? {} : { recurrenciaSemanalHasta: recurrente ? String(form.get('recurrenciaHasta')) : undefined }),
    }

    const result = initial
      ? await actualizarEvento(clubSlug, initial.id, payload)
      : await crearEvento(clubSlug, payload)

    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    router.push(`/${clubSlug}/calendario`)
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxWidth: 520 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        Tipo de evento
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          required
        >
          <option value="entrenamiento">Entrenamiento</option>
          <option value="partido">Partido</option>
          <option value="evento_social">Evento social</option>
        </select>
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        Categoría
        <select name="teamId" defaultValue={initial?.teamId ?? ''}>
          {!allowSinCategoria && <option value="">Sin categoría</option>}
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.sport} {c.label}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        Título
        <input name="title" defaultValue={initial?.title ?? ''} placeholder="Ej: Entrenamiento M16" required maxLength={160} />
      </label>

      {kind === 'partido' && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          Rival
          <input name="opponent" defaultValue={initial?.opponent ?? ''} placeholder="Nombre del rival" maxLength={120} />
        </label>
      )}

      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        Lugar
        <input name="location" defaultValue={initial?.location ?? ''} placeholder="Ej: Cancha 1" maxLength={160} />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        Fecha y hora de inicio
        <input
          name="startsAt"
          type="datetime-local"
          defaultValue={initial ? toDatetimeLocal(initial.startsAt) : ''}
          required
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        Fecha y hora de fin (opcional, se asume +1h)
        <input
          name="endsAt"
          type="datetime-local"
          defaultValue={initial?.endsAt ? toDatetimeLocal(initial.endsAt) : ''}
        />
      </label>

      {!initial && kind === 'entrenamiento' && (
        <fieldset style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '0.6rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
            <input
              type="checkbox"
              checked={recurrente}
              onChange={(e) => setRecurrente(e.target.checked)}
            />
            Repetir semanalmente
          </label>
          {recurrente && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              Repetir hasta
              <input name="recurrenciaHasta" type="date" required />
            </label>
          )}
        </fieldset>
      )}

      {error && <p role="alert" style={{ color: '#dc2626', fontSize: '0.875rem' }}>{error}</p>}

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="submit" disabled={submitting}>
          {initial ? 'Guardar cambios' : 'Crear evento'}
        </button>
        <button type="button" onClick={() => router.push(`/${clubSlug}/calendario`)}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
