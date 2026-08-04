'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { eliminarEvento } from '../actions'

export function EliminarEventoButton({
  clubSlug,
  eventId,
  titulo,
}: {
  clubSlug: string
  eventId: string
  titulo: string
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [confirmacion, setConfirmacion] = useState('')

  const habilitado = confirmacion === titulo

  async function onEliminar() {
    setError(null)
    const result = await eliminarEvento(clubSlug, eventId)
    if (!result.ok) {
      setError(result.error)
      return
    }
    router.push(`/${clubSlug}/calendario`)
    router.refresh()
  }

  return (
    <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '0.75rem', marginTop: '0.75rem' }}>
      <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
        Para eliminar escribí el título: <strong>{titulo}</strong>
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          value={confirmacion}
          onChange={(e) => setConfirmacion(e.target.value)}
          placeholder={titulo}
          style={{ maxWidth: 260, padding: '0.35rem 0.5rem', fontSize: '0.875rem' }}
        />
        <button
          type="button"
          onClick={onEliminar}
          disabled={!habilitado}
          style={{ color: habilitado ? '#dc2626' : undefined, borderColor: habilitado ? '#dc2626' : undefined }}
        >
          Eliminar
        </button>
      </div>
      {error && <p role="alert" style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: '0.25rem' }}>{error}</p>}
    </div>
  )
}
