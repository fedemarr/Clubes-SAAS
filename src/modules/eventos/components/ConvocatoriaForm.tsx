'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { publicarConvocatoria } from '../actions'

type JugadorConvocable = {
  personId: string
  nombre: string
  apellido: string
  position: string | null
  estadoParticipacion: string | null
}

export function ConvocatoriaForm({
  clubSlug,
  eventId,
  plantel,
}: {
  clubSlug: string
  eventId: string
  plantel: JugadorConvocable[]
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [seleccion, setSeleccion] = useState<Set<string>>(
    () => new Set(plantel.filter((p) => p.estadoParticipacion).map((p) => p.personId)),
  )

  function toggle(personId: string) {
    setSeleccion((prev) => {
      const next = new Set(prev)
      if (next.has(personId)) next.delete(personId)
      else next.add(personId)
      return next
    })
  }

  async function onPublicar() {
    setError(null)
    setMensaje(null)
    setSubmitting(true)
    const result = await publicarConvocatoria(clubSlug, { eventId, personIds: [...seleccion] })
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setMensaje(`Convocatoria publicada: ${result.data.convocados} jugadores, ${result.data.notificados} avisos enviados.`)
    router.refresh()
  }

  return (
    <div>
      {mensaje && (
        <p role="status" style={{ color: '#059669', marginBottom: '0.75rem' }}>
          {mensaje}
        </p>
      )}
      {error && (
        <p role="alert" style={{ color: '#dc2626', marginBottom: '0.75rem' }}>
          {error}
        </p>
      )}

      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.35rem' }}>
        {plantel.map((p) => (
          <li key={p.personId}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.7rem 0.6rem',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                minHeight: 44,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={seleccion.has(p.personId)}
                onChange={() => toggle(p.personId)}
                style={{ width: 20, height: 20 }}
              />
              <span style={{ fontWeight: 500 }}>
                {p.apellido}, {p.nombre}
              </span>
              {p.position && <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>{p.position}</span>}
            </label>
          </li>
        ))}
      </ul>

      <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button type="button" onClick={onPublicar} disabled={submitting || seleccion.size === 0}>
          {submitting ? 'Publicando…' : `Publicar convocatoria (${seleccion.size})`}
        </button>
        <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          Los menores reciben el aviso a través de su tutor.
        </span>
      </div>
    </div>
  )
}
