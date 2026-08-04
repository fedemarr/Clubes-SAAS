import { and, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { checkPermission } from '@/lib/permissions'
import { listarPlantelParaEvento } from '@/modules/eventos/queries'
import { ConvocatoriaForm } from '@/modules/eventos/components/ConvocatoriaForm'

function formatFecha(iso: Date, tz: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export default async function ConvocatoriaPage({
  params,
}: {
  params: Promise<{ club: string; id: string }>
}) {
  const { club: slug, id } = await params

  const ctx = await checkPermission('convocatoria.ver', { kind: 'club' }, slug)
  if (!ctx) return <main style={{ padding: '1rem' }}>No tenés permiso para convocar.</main>

  const [club] = await db
    .select()
    .from(clubs)
    .where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)))
    .limit(1)
  if (!club) return null

  const datos = await listarPlantelParaEvento(club.id, id)
  if (!datos) return notFound()

  if (ctx.scopeTeamIds.length > 0) {
    // Necesitamos el teamId del evento para el chequeo de scope.
    const eventoScoped = datos.evento.teamId
    if (!eventoScoped || !ctx.scopeTeamIds.includes(eventoScoped)) return notFound()
  }

  const puedePublicar = await checkPermission('convocatoria.publicar', { kind: 'club' }, slug)

  return (
    <main style={{ padding: '1rem' }}>
      <Link href={`/${slug}/calendario/${id}`} style={{ fontSize: '0.875rem', color: '#6b7280' }}>
        ← Volver al evento
      </Link>

      <h1 style={{ marginTop: '0.5rem' }}>Convocatoria</h1>
      <p style={{ color: '#6b7280' }}>
        {datos.evento.title} · {formatFecha(datos.evento.startsAt, club.timezone)}
      </p>

      {datos.plantel.length === 0 && (
        <p style={{ color: '#6b7280', marginTop: '1rem' }}>
          Esta categoría no tiene jugadores asignados todavía.
        </p>
      )}

      {datos.plantel.length > 0 && puedePublicar && (
        <div style={{ marginTop: '1rem' }}>
          <ConvocatoriaForm clubSlug={slug} eventId={id} plantel={datos.plantel} />
        </div>
      )}
    </main>
  )
}
