import { checkPermission } from '@/lib/permissions'
import { PersonaForm } from '@/modules/personas/components/PersonaForm'

export default async function NuevaPersonaPage({ params }: { params: Promise<{ club: string }> }) {
  const { club: slug } = await params

  const ctx = await checkPermission('personas.editar', { kind: 'club' }, slug)
  if (!ctx) return <main style={{ padding: '1rem' }}>No tenés permiso para crear personas.</main>

  return (
    <main style={{ padding: '1rem' }}>
      <h1>Nueva persona</h1>
      <PersonaForm clubSlug={slug} />
    </main>
  )
}
