import { and, eq, isNull } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { checkPermission } from '@/lib/permissions'
import { obtenerEvento, listarCategoriasActivas } from '@/modules/eventos/queries'
import { EventoForm } from '@/modules/eventos/components/EventoForm'

export default async function EditarEventoPage({
  params,
}: {
  params: Promise<{ club: string; id: string }>
}) {
  const { club: slug, id } = await params

  const ctx = await checkPermission('calendario.editar', { kind: 'club' }, slug)
  if (!ctx) return <main style={{ padding: '1rem' }}>No tenés permiso para editar eventos.</main>

  const [club] = await db
    .select()
    .from(clubs)
    .where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)))
    .limit(1)
  if (!club) return null

  const evento = await obtenerEvento(club.id, id)
  if (!evento) return notFound()

  if (ctx.scopeTeamIds.length > 0 && evento.teamId && !ctx.scopeTeamIds.includes(evento.teamId)) {
    return notFound()
  }

  const todasLasCategorias = await listarCategoriasActivas(club.id)
  const allowSinCategoria = ctx.scopeTeamIds.length === 0
  const categorias = ctx.scopeTeamIds.length > 0
    ? todasLasCategorias.filter((c) => ctx.scopeTeamIds.includes(c.id))
    : todasLasCategorias

  return (
    <main style={{ padding: '1rem' }}>
      <h1>Editar evento</h1>
      <EventoForm
        clubSlug={slug}
        categorias={categorias}
        allowSinCategoria={allowSinCategoria}
        initial={{
          id: evento.id,
          kind: evento.kind,
          teamId: evento.teamId,
          title: evento.title ?? '',
          location: evento.location,
          startsAt: evento.startsAt,
          endsAt: evento.endsAt,
          opponent: evento.opponent,
        }}
      />
    </main>
  )
}
