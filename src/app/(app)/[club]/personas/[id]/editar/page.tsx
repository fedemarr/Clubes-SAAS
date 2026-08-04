import { and, eq, isNull } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { checkPermission } from '@/lib/permissions'
import { PersonaForm } from '@/modules/personas/components/PersonaForm'
import { obtenerPersona } from '@/modules/personas/queries'

export default async function EditarPersonaPage({ params }: { params: Promise<{ club: string; id: string }> }) {
  const { club: slug, id } = await params

  const ctx = await checkPermission('personas.editar', { kind: 'club' }, slug)
  if (!ctx) return <main style={{ padding: '1rem' }}>No tenés permiso para editar personas.</main>

  const [club] = await db.select().from(clubs).where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt))).limit(1)
  if (!club) return null

  const persona = await obtenerPersona(club.id, id)
  if (!persona) notFound()

  return (
    <main style={{ padding: '1rem' }}>
      <h1>
        Editar a {persona.firstName} {persona.lastName}
      </h1>
      <PersonaForm clubSlug={slug} persona={persona} />
    </main>
  )
}
