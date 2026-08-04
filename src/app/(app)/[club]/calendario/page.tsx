import { and, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { checkPermission } from '@/lib/permissions'
import { listarEventos, listarCategoriasActivas, listarDeportes } from '@/modules/eventos/queries'

const KIND_LABELS: Record<string, string> = {
  entrenamiento: 'Entrenamiento',
  partido: 'Partido',
  evento_social: 'Social',
  asamblea: 'Asamblea',
  turno_voluntario: 'Turno',
}

const KIND_COLORS: Record<string, string> = {
  entrenamiento: '#2563eb',
  partido: '#dc2626',
  evento_social: '#7c3aed',
  asamblea: '#059669',
  turno_voluntario: '#d97706',
}

function formatDate(iso: Date, tz: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export default async function CalendarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ club: string }>
  searchParams: Promise<{ deporte?: string; categoria?: string; tipo?: string }>
}) {
  const { club: slug } = await params
  const sp = await searchParams

  const ctx = await checkPermission('calendario.ver', { kind: 'club' }, slug)
  if (!ctx) {
    return <main style={{ padding: '1rem' }}>No tenés permiso para ver el calendario.</main>
  }

  const puedeEditar = await checkPermission('calendario.editar', { kind: 'club' }, slug)

  const [club] = await db
    .select()
    .from(clubs)
    .where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)))
    .limit(1)
  if (!club) return null

  const eventos = await listarEventos(club.id, {
    deporte: sp.deporte,
    categoriaId: sp.categoria,
    kind: sp.tipo as (typeof import('@/db/schema').eventKind.enumValues)[number] | undefined,
    teamIds: ctx.scopeTeamIds.length > 0 ? ctx.scopeTeamIds : null,
  })

  const deportes = await listarDeportes(club.id)
  const categorias = await listarCategoriasActivas(club.id)

  const eventosPorDia = Map.groupBy(eventos, (e) => new Date(e.startsAt).toISOString().slice(0, 10))

  return (
    <main style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1>Calendario</h1>
        {puedeEditar && (
          <Link href={`/${slug}/calendario/nuevo`} style={{ padding: '0.4rem 0.8rem', border: '1px solid #d1d5db', borderRadius: 6 }}>
            + Nuevo evento
          </Link>
        )}
      </div>

      <form method="get" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        <select name="tipo" defaultValue={sp.tipo ?? ''}>
          <option value="">Todos los tipos</option>
          {Object.entries(KIND_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select name="deporte" defaultValue={sp.deporte ?? ''}>
          <option value="">Todos los deportes</option>
          {deportes.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select name="categoria" defaultValue={sp.categoria ?? ''}>
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>{c.sport} {c.label}</option>
          ))}
        </select>
        <button type="submit">Filtrar</button>
        {(sp.deporte || sp.categoria || sp.tipo) && (
          <Link href={`/${slug}/calendario`} style={{ padding: '0.4rem 0.6rem' }}>
            Limpiar filtros
          </Link>
        )}
      </form>

      {eventos.length === 0 && (
        <p style={{ color: '#6b7280' }}>No hay eventos próximos.</p>
      )}

      {[...eventosPorDia.entries()].map(([dia, eventosDelDia]) => (
        <section key={dia} style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '0.9rem', color: '#6b7280', textTransform: 'capitalize', marginBottom: '0.4rem' }}>
            {new Date(dia + 'T12:00:00Z').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </h2>
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.4rem' }}>
            {eventosDelDia.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/${slug}/calendario/${e.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    padding: '0.6rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    color: 'inherit',
                    textDecoration: 'none',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: '#fff',
                      padding: '0.15rem 0.4rem',
                      borderRadius: 4,
                      backgroundColor: KIND_COLORS[e.kind] ?? '#6b7280',
                    }}
                  >
                    {KIND_LABELS[e.kind] ?? e.kind}
                  </span>
                  <span style={{ flex: 1, fontWeight: 500 }}>{e.title}</span>
                  {e.categoriaLabel && (
                    <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                      {e.deporte} {e.categoriaLabel}
                    </span>
                  )}
                  {e.opponent && (
                    <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>vs {e.opponent}</span>
                  )}
                  <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                    {formatDate(e.startsAt, club.timezone)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  )
}
