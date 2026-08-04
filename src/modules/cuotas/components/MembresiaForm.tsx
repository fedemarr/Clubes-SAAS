'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { crearMembresia } from '../actions'
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

type Persona = { id: string; nombre: string; apellido: string }
type Cuenta = { id: string; label: string | null; holderNombre: string; holderApellido: string }
type Plan = { id: string; name: string; sport: string | null }

export function MembresiaForm({
  clubSlug,
  personas,
  cuentas,
  planes,
}: {
  clubSlug: string
  personas: Persona[]
  cuentas: Cuenta[]
  planes: Plan[]
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [planId, setPlanId] = useState<string | undefined>()

  async function onCrear(form: FormData) {
    setError(null)
    setEnviando(true)
    const result = await crearMembresia(clubSlug, {
      personId: String(form.get('persona') ?? ''),
      accountId: String(form.get('cuenta') ?? ''),
      feePlanId: planId ?? '',
      status: 'activa',
      startedOn: String(form.get('startedOn') ?? ''),
    })
    setEnviando(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    router.push(`/${clubSlug}/cuotas/membresias`)
    router.refresh()
  }

  return (
    <form action={onCrear} className="mt-6 grid max-w-md gap-4">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-1.5">
        <Label htmlFor="persona">Persona</Label>
        <Select name="persona" required>
          <SelectTrigger id="persona">
            <SelectValue placeholder="Elegí una persona" />
          </SelectTrigger>
          <SelectContent>
            {personas.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.apellido}, {p.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="cuenta">Cuenta corriente (grupo familiar)</Label>
        <Select name="cuenta" required>
          <SelectTrigger id="cuenta">
            <SelectValue placeholder="Elegí la cuenta" />
          </SelectTrigger>
          <SelectContent>
            {cuentas.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.label ?? `${c.holderApellido}, ${c.holderNombre}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="plan">Plan</Label>
        <Select required onValueChange={(v) => setPlanId(v as string)}>
          <SelectTrigger id="plan">
            <SelectValue placeholder="Elegí el plan" />
          </SelectTrigger>
          <SelectContent>
            {planes.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} {p.sport ? `· ${p.sport}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="startedOn">Desde</Label>
        <Input id="startedOn" name="startedOn" type="date" required />
      </div>

      <Button type="submit" disabled={enviando}>{enviando ? 'Guardando…' : 'Alta de membresía'}</Button>
    </form>
  )
}
