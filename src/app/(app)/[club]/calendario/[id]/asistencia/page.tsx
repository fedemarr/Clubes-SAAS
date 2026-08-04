import { and, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { checkPermission } from '@/lib/permissions'
import { listarPlantelParaEvento } from '@/modules/eventos/queries'
import { AsistenciaForm } from '@/modules/eventos/components/AsistenciaForm'

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

export default async function AsistenciaPage({
  params,
}: {
  params: Promise<{ club: string; id: string }>
}) {
  const { club: slug, id } = await params

  const ctx = await checkPermission('asistencia.ver', { kind: 'club' }, slug)
  if (!ctx) return <main style={{ padding: '1rem' }}>No tenés permiso para ver asistencia.</main>

  const [club] = await db
    .select()
    .from(clubs)
    .where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)))
    .limit(1)
  if (!club) return null

  const datos = await listarPlantelParaEvento(club.id, id)
  if (!datos) return notFound()

  if (ctx.scopeTeamIds.length > 0) {
    if (!datos.evento.teamId || !ctx.scopeTeamIds.includes(datos.evento.teamId)) return notFound()
  }

  const puedeTomar = (await checkPermission('asistencia.tomar', { kind: 'club' }, slug)) !== null

  const plantel = datos.plantel.map((p) => ({
    personId: p.personId,
    nombre: p.nombre,
    apellido: p.apellido,
    position: p.position,
    estado: (p.estadoParticipacion ?? 'convocado') as
      | 'convocado'
      | 'presente'
      | 'ausente'
      | 'justificado'
      | 'lesionado'
      | null,
    // Hooks para M7 (apto/documentación) y M3 (deuda como semáforo): hoy no
    // hay datos, se rellenan cuando esos módulos existan.
    aptoVencido: null,
    documentacionFaltante: null,
    deuda: null,
  }))

  return (
    <main style={{ padding: '1rem' }}>
      <Link href={`/${slug}/calendario/${id}`} style={{ fontSize: '0.875rem', color: '#6b7280' }}>
        ← Volver al evento
      </Link>

      <h1 style={{ marginTop: '0.5rem' }}>Asistencia</h1>
      <p style={{ color: '#6b7280' }}>
        {datos.evento.title} · {formatFecha(datos.evento.startsAt, club.timezone)}
      </p>

      {datos.plantel.length === 0 && (
        <p style={{ color: '#6b7280', marginTop: '1rem' }}>
          Esta categoría no tiene jugadores asignados todavía.
        </p>
      )}

      {datos.plantel.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <AsistenciaForm clubSlug={slug} eventId={id} plantel={plantel} puedeTomar={Boolean(puedeTomar)} />
        </div>
      )}
    </main>
  )
}
