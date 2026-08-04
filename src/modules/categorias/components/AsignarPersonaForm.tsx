'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { buscarPersonasParaVinculo } from '@/modules/personas/actions'
import { asignarPersonaACategoria } from '../actions'

type Resultado = { id: string; nombre: string; docNumber: string | null }

export function AsignarPersonaForm({ clubSlug, teamId }: { clubSlug: string; teamId: string }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState<Resultado[]>([])
  const [elegido, setElegido] = useState<Resultado | null>(null)
  const [position, setPosition] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function buscar(valor: string) {
    setQ(valor)
    setElegido(null)
    if (valor.trim().length < 2) {
      setResultados([])
      return
    }
    const r = await buscarPersonasParaVinculo(clubSlug, valor)
    if (r.ok) setResultados(r.data)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!elegido) {
      setError('Elegí una persona de la lista')
      return
    }
    setSubmitting(true)
    const result = await asignarPersonaACategoria(clubSlug, {
      personId: elegido.id,
      teamId,
      position: position || undefined,
      validFrom: new Date().toISOString().slice(0, 10),
    })
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setElegido(null)
    setQ('')
    setPosition('')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: '0.5rem', maxWidth: 420, margin: '0.75rem 0' }}>
      <input
        type="search"
        placeholder="Buscar persona por apellido o DNI"
        value={q}
        onChange={(e) => buscar(e.target.value)}
      />
      {resultados.length > 0 && !elegido && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, border: '1px solid #ddd' }}>
          {resultados.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  setElegido(r)
                  setResultados([])
                  setQ(r.nombre)
                }}
                style={{ width: '100%', textAlign: 'left', padding: '0.35rem' }}
              >
                {r.nombre} {r.docNumber ? `· ${r.docNumber}` : ''}
              </button>
            </li>
          ))}
        </ul>
      )}
      <input placeholder="Posición (opcional)" value={position} onChange={(e) => setPosition(e.target.value)} />
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>
        Asignar a esta categoría
      </button>
    </form>
  )
}
