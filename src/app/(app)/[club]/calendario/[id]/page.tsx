import { and, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { checkPermission } from '@/lib/permissions'
import { obtenerEvento } from '@/modules/eventos/queries'
import { EliminarEventoButton } from '@/modules/eventos/components/EliminarEventoButton'

function formatDate(iso: Date, tz: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export default async function EventoDetallePage({
  params,
}: {
  params: Promise<{ club: string; id: string }>
}) {
  const { club: slug, id } = await params

  const ctx = await checkPermission('calendario.ver', { kind: 'club' }, slug)
  if (!ctx) return <main style={{ padding: '1rem' }}>No tenés permiso para ver eventos.</main>

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
  if (ctx.scopeTeamIds.length > 0 && !evento.teamId) {
    return notFound()
  }

  let puedeEditar = await checkPermission('calendario.editar', { kind: 'club' }, slug)
  if (puedeEditar && ctx.scopeTeamIds.length > 0 && evento.teamId && !ctx.scopeTeamIds.includes(evento.teamId)) {
    puedeEditar = null
  }

  const puedeConvocar = evento.teamId
    ? await checkPermission('convocatoria.publicar', { kind: 'team', teamId: evento.teamId }, slug)
    : null

  const puedeTomarAsistencia = evento.teamId
    ? await checkPermission('asistencia.tomar', { kind: 'team', teamId: evento.teamId }, slug)
    : null

  const KIND_LABELS: Record<string, string> = {
    entrenamiento: 'Entrenamiento',
    partido: 'Partido',
    evento_social: 'Evento social',
    asamblea: 'Asamblea',
    turno_voluntario: 'Turno',
  }

  return (
    <main style={{ padding: '1rem' }}>
      <Link href={`/${slug}/calendario`} style={{ fontSize: '0.875rem', color: '#6b7280' }}>
        ← Calendario
      </Link>

      <h1 style={{ marginTop: '0.5rem' }}>{evento.title}</h1>

      <dl style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.3rem 1rem' }}>
        <dt style={{ color: '#6b7280' }}>Tipo</dt>
        <dd>{KIND_LABELS[evento.kind] ?? evento.kind}</dd>

        {evento.categoriaLabel && (
          <>
            <dt style={{ color: '#6b7280' }}>Categoría</dt>
            <dd>{evento.deporte} {evento.categoriaLabel}</dd>
          </>
        )}

        {evento.opponent && (
          <>
            <dt style={{ color: '#6b7280' }}>Rival</dt>
            <dd>{evento.opponent}</dd>
          </>
        )}

        {evento.location && (
          <>
            <dt style={{ color: '#6b7280' }}>Lugar</dt>
            <dd>{evento.location}</dd>
          </>
        )}

        <dt style={{ color: '#6b7280' }}>Inicio</dt>
        <dd>{formatDate(evento.startsAt, club.timezone)}</dd>

        {evento.endsAt && (
          <>
            <dt style={{ color: '#6b7280' }}>Fin</dt>
            <dd>{formatDate(evento.endsAt, club.timezone)}</dd>
          </>
        )}
      </dl>

      {puedeConvocar && (
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Link
            href={`/${slug}/calendario/${id}/convocatoria`}
            style={{ padding: '0.4rem 0.8rem', border: '1px solid #d1d5db', borderRadius: 6 }}
          >
            Convocar jugadores
          </Link>
        </div>
      )}

      {puedeTomarAsistencia && (
        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Link
            href={`/${slug}/calendario/${id}/asistencia`}
            style={{ padding: '0.4rem 0.8rem', border: '1px solid #d1d5db', borderRadius: 6 }}
          >
            Tomar asistencia
          </Link>
        </div>
      )}

      {puedeEditar && (
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Link
            href={`/${slug}/calendario/${id}/editar`}
            style={{ padding: '0.4rem 0.8rem', border: '1px solid #d1d5db', borderRadius: 6 }}
          >
            Editar
          </Link>
          <EliminarEventoButton clubSlug={slug} eventId={id} titulo={evento.title ?? ''} />
        </div>
      )}
    </main>
  )
}
