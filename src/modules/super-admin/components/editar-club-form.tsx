'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Save } from 'lucide-react'
import { actualizarClubGeneral } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function EditarClubForm({
  club,
}: {
  club: {
    id: string
    name: string
    slug: string
    locality: string | null
    logoUrl: string | null
    timezone: string
    branding: { primary?: string; secondary?: string; tagline?: string } | null
  }
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setOk(null)
    setSubmitting(true)
    const form = new FormData(e.currentTarget)
    const result = await actualizarClubGeneral(club.slug, {
      name: form.get('name'),
      slug: form.get('slug'),
      locality: form.get('locality') || null,
      logoUrl: form.get('logoUrl') || null,
      timezone: form.get('timezone'),
      primary: form.get('primary') || undefined,
      secondary: form.get('secondary') || undefined,
      tagline: form.get('tagline') || undefined,
    })
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setOk('Guardado.')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="max-w-lg space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="club-name">Nombre</Label>
          <Input id="club-name" name="name" defaultValue={club.name} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="club-slug">Slug</Label>
          <Input id="club-slug" name="slug" defaultValue={club.slug} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="club-locality">Localidad</Label>
          <Input id="club-locality" name="locality" defaultValue={club.locality ?? ''} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="club-tz">Timezone</Label>
          <Input id="club-tz" name="timezone" defaultValue={club.timezone} required />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="club-logo">Logo URL</Label>
        <Input id="club-logo" name="logoUrl" defaultValue={club.logoUrl ?? ''} placeholder="https://..." />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="club-primary">Color primario</Label>
          <div className="flex items-center gap-2">
            <input
              id="club-primary"
              name="primary"
              type="color"
              defaultValue={club.branding?.primary ?? '#111827'}
              className="h-9 w-10 cursor-pointer rounded-md border bg-background"
            />
            <span className="text-xs text-muted-foreground">
              {club.branding?.primary ?? '#111827'}
            </span>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="club-secondary">Color secundario</Label>
          <div className="flex items-center gap-2">
            <input
              id="club-secondary"
              name="secondary"
              type="color"
              defaultValue={club.branding?.secondary ?? '#6B7280'}
              className="h-9 w-10 cursor-pointer rounded-md border bg-background"
            />
            <span className="text-xs text-muted-foreground">
              {club.branding?.secondary ?? '#6B7280'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="club-tagline">Tagline</Label>
        <Input
          id="club-tagline"
          name="tagline"
          defaultValue={club.branding?.tagline ?? ''}
          placeholder="Un club, una familia"
        />
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {ok && <p className="text-sm text-green-600">{ok}</p>}

      <Button type="submit" disabled={submitting}>
        <Save className="size-4" />
        {submitting ? 'Guardando...' : 'Guardar cambios'}
      </Button>
    </form>
  )
}