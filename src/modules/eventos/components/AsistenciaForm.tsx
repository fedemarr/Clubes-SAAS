'use client'

import { useCallback, useEffect, useState } from 'react'
import { registrarAsistenciaLote } from '../actions'

type JugadorAsistencia = {
  personId: string
  nombre: string
  apellido: string
  position: string | null
  estado: 'convocado' | 'presente' | 'ausente' | 'justificado' | 'lesionado' | null
  aptoVencido: boolean | null
  documentacionFaltante: boolean | null
  deuda: 'al_dia' | 'deudor' | null
}

const ESTADO_ESTILO: Record<string, { bg: string; fg: string; label: string }> = {
  presente: { bg: '#dcfce7', fg: '#166534', label: 'Presente' },
  ausente: { bg: '#fee2e2', fg: '#991b1b', label: 'Ausente' },
  justificado: { bg: '#fef9c3', fg: '#854d0e', label: 'Justificado' },
}

export function AsistenciaForm({
  clubSlug,
  eventId,
  plantel,
  puedeTomar,
}: {
  clubSlug: string
  eventId: string
  plantel: JugadorAsistencia[]
  puedeTomar: boolean
}) {
  const [base, setBase] = useState<Record<string, JugadorAsistencia['estado']>>(() =>
    Object.fromEntries(plantel.map((p) => [p.personId, p.estado])),
  )
  const [estados, setEstados] = useState<Record<string, JugadorAsistencia['estado']>>(() =>
    Object.fromEntries(plantel.map((p) => [p.personId, p.estado])),
  )
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [enLinea, setEnLinea] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)

  useEffect(() => {
    const online = () => setEnLinea(true)
    const offline = () => setEnLinea(false)
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
    }
  }, [])

  const pendientes = Object.entries(estados).filter(([id, st]) => st !== base[id])

  function marcar(personId: string, estado: JugadorAsistencia['estado']) {
    setEstados((prev) => ({ ...prev, [personId]: prev[personId] === estado ? 'convocado' : estado }))
  }

  const guardar = useCallback(async () => {
    const cambios = pendientes.map(([personId, status]) => ({ personId, status: status ?? 'convocado' }))
    if (cambios.length === 0) return
    setError(null)
    setGuardando(true)
    const result = await registrarAsistenciaLote(clubSlug, { eventId, cambios })
    setGuardando(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setBase(estados)
  }, [clubSlug, eventId, pendientes, estados])

  useEffect(() => {
    if (enLinea && pendientes.length > 0 && !guardando) {
      void guardar()
    }
  }, [enLinea, pendientes.length, guardando, guardar])

  return (
    <div>
      {error && (
        <p role="alert" style={{ color: '#dc2626', marginBottom: '0.75rem' }}>
          {error}
        </p>
      )}

      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.4rem' }}>
        {plantel.map((p) => {
          const est = estados[p.personId]
          const estilo = est ? ESTADO_ESTILO[est] : undefined
          return (
            <li key={p.personId}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: 10,
                  background: estilo?.bg ?? '#ffffff',
                  minHeight: 56,
                  padding: '0.5rem 0.6rem',
                }}
              >
                <button
                  type="button"
                  disabled={!puedeTomar}
                  onClick={() => marcar(p.personId, 'presente')}
                  style={{
                    flex: 1,
                    textAlign: 'left',
                    border: 'none',
                    background: 'transparent',
                    cursor: puedeTomar ? 'pointer' : 'default',
                    minHeight: 44,
                  }}
                >
                  <span style={{ fontWeight: 500, display: 'block' }}>
                    {p.apellido}, {p.nombre}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {[p.position, estilo?.label].filter(Boolean).join(' · ') || 'Sin marcar'}
                  </span>
                  <span style={{ display: 'flex', gap: '0.25rem', marginTop: '0.15rem' }}>
                    {p.aptoVencido && <span style={{ fontSize: '0.7rem', color: '#991b1b' }}>apto vencido</span>}
                    {p.documentacionFaltante && (
                      <span style={{ fontSize: '0.7rem', color: '#991b1b' }}>documentación incompleta</span>
                    )}
                    {p.deuda === 'deudor' && <span style={{ fontSize: '0.7rem', color: '#b91c1c' }}>●</span>}
                    {p.deuda === 'al_dia' && <span style={{ fontSize: '0.7rem', color: '#166534' }}>●</span>}
                  </span>
                </button>

                {puedeTomar && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <button
                      type="button"
                      onClick={() => marcar(p.personId, 'ausente')}
                      style={{ fontSize: '0.8rem', padding: '0.15rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, minHeight: 28 }}
                    >
                      A
                    </button>
                    <button
                      type="button"
                      onClick={() => marcar(p.personId, 'justificado')}
                      style={{ fontSize: '0.8rem', padding: '0.15rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, minHeight: 28 }}
                    >
                      J
                    </button>
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {puedeTomar && (
          <button type="button" onClick={guardar} disabled={guardando || pendientes.length === 0}>
            {guardando ? 'Guardando…' : `Guardar asistencia (${pendientes.length})`}
          </button>
        )}
        <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          {enLinea
            ? pendientes.length > 0
              ? 'Cambios sin guardar'
              : 'Guardado'
            : 'Sin conexión — se guardará al reconectar'}
        </span>
      </div>
    </div>
  )
}
