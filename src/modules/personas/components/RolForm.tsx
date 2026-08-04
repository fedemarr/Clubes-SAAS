'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { agregarRol } from '../actions'

const ROLES = [
  'jugador',
  'tutor',
  'entrenador',
  'manager',
  'coordinador',
  'preparador_fisico',
  'medico',
  'secretaria',
  'tesorero',
  'presidente',
  'directivo',
  'empleado',
  'socio_no_deportivo',
]

export function RolForm({
  clubSlug,
  personId,
  categorias,
}: {
  clubSlug: string
  personId: string
  categorias: { id: string; label: string; sport: string }[]
}) {
  const router = useRouter()
  const [role, setRole] = useState('jugador')
  const [scopeTeamId, setScopeTeamId] = useState('')
  const [validFrom, setValidFrom] = useState(() => new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const result = await agregarRol(clubSlug, {
      personId,
      role,
      scopeTeamId: scopeTeamId || undefined,
      validFrom,
    })
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: '0.5rem', marginTop: '0.5rem', maxWidth: 420 }}>
      <select value={role} onChange={(e) => setRole(e.target.value)}>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <select value={scopeTeamId} onChange={(e) => setScopeTeamId(e.target.value)}>
        <option value="">Sin categoría (rol de club)</option>
        {categorias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.sport} · {c.label}
          </option>
        ))}
      </select>
      <label>
        Vigente desde
        <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>
        Agregar rol
      </button>
    </form>
  )
}
