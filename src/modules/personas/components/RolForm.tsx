'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { agregarRol } from '../actions'
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

const ROLE_LABELS: Record<string, string> = {
  jugador: 'Jugador',
  tutor: 'Tutor',
  entrenador: 'Entrenador',
  manager: 'Manager',
  coordinador: 'Coordinador',
  preparador_fisico: 'Preparador físico',
  medico: 'Médico',
  secretaria: 'Secretaría',
  tesorero: 'Tesorero',
  presidente: 'Presidente',
  directivo: 'Directivo',
  empleado: 'Empleado',
  socio_no_deportivo: 'Socio no deportivo',
}

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
    <form onSubmit={onSubmit} className="mt-4 grid max-w-md gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="rol-nuevo">Rol</Label>
        <Select value={role} onValueChange={(v) => setRole(v ?? 'jugador')}>
          <SelectTrigger id="rol-nuevo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r] ?? r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="rol-alcance">Alcance</Label>
        <Select value={scopeTeamId} onValueChange={(v) => setScopeTeamId(v ?? '')}>
          <SelectTrigger id="rol-alcance">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Sin categoría (rol de club)</SelectItem>
            {categorias.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.sport} · {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="rol-desde">Vigente desde</Label>
        <Input id="rol-desde" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div>
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? 'Agregando…' : 'Agregar rol'}
        </Button>
      </div>
    </form>
  )
}
