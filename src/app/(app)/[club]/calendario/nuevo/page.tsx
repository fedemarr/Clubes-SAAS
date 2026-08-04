import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { checkPermission } from '@/lib/permissions'
import { listarCategoriasActivas } from '@/modules/eventos/queries'
import { EventoForm } from '@/modules/eventos/components/EventoForm'

export default async function NuevoEventoPage({ params }: { params: Promise<{ club: string }> }) {
  const { club: slug } = await params

  const ctx = await checkPermission('calendario.editar', { kind: 'club' }, slug)
  if (!ctx) return <main style={{ padding: '1rem' }}>No tenés permiso para crear eventos.</main>

  const [club] = await db
    .select()
    .from(clubs)
    .where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)))
    .limit(1)
  if (!club) return null

  const todasLasCategorias = await listarCategoriasActivas(club.id)
  const allowSinCategoria = ctx.scopeTeamIds.length === 0
  const categorias = ctx.scopeTeamIds.length > 0
    ? todasLasCategorias.filter((c) => ctx.scopeTeamIds.includes(c.id))
    : todasLasCategorias

  return (
    <main style={{ padding: '1rem' }}>
      <h1>Nuevo evento</h1>
      <EventoForm clubSlug={slug} categorias={categorias} allowSinCategoria={allowSinCategoria} />
    </main>
  )
}
