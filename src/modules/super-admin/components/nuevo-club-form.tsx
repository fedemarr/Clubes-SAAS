'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { crearClub } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function NuevoClubForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [abierto, setAbierto] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const form = new FormData(e.currentTarget)
    const result = await crearClub({
      name: form.get('name'),
      slug: form.get('slug'),
      locality: form.get('locality') || undefined,
      timezone: form.get('timezone') || undefined,
    })
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setAbierto(false)
    router.push(`/super-admin/clubs/${result.data.slug}`)
    router.refresh()
  }

  if (!abierto) {
    return (
      <Button type="button" onClick={() => setAbierto(true)}>
        <Plus className="size-4" />
        Nuevo club
      </Button>
    )
  }

  return (
    <form onSubmit={onSubmit} className="w-full rounded-xl border bg-card p-4 shadow-xs sm:w-96">
      <div className="space-y-3">
        <div className="grid gap-1.5">
          <Label htmlFor="sa-name">Nombre</Label>
          <Input id="sa-name" name="name" placeholder="Club Atlético..." required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sa-slug">Slug</Label>
          <Input id="sa-slug" name="slug" placeholder="los-cedros" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sa-locality">Localidad</Label>
          <Input id="sa-locality" name="locality" placeholder="San Miguel, Buenos Aires" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sa-tz">Timezone</Label>
          <Input
            id="sa-tz"
            name="timezone"
            defaultValue="America/Argentina/Buenos_Aires"
            placeholder="America/Argentina/Buenos_Aires"
          />
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creando...' : 'Crear club'}
          </Button>
          <Button type="button" variant="outline" onClick={() => setAbierto(false)}>
            Cancelar
          </Button>
        </div>
      </div>
    </form>
  )
}