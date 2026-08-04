import { and, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { checkPermission } from '@/lib/permissions'
import { listarEventos, listarCategoriasActivas, listarDeportes } from '@/modules/eventos/queries'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'

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

function formatDia(dia: string): string {
  return new Date(dia + 'T12:00:00Z').toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
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
    return <main className="px-4 py-6 text-muted-foreground">No tenés permiso para ver el calendario.</main>
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
    <main>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Calendario</h1>
          <p className="text-sm text-muted-foreground">Próximos eventos del club</p>
        </div>
        {puedeEditar && (
          <Button render={<Link href={`/${slug}/calendario/nuevo`} />}>Nuevo evento</Button>
        )}
      </div>

      <form method="get" className="mt-4 flex flex-wrap items-center gap-2">
        <select
          name="tipo"
          defaultValue={sp.tipo ?? ''}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Todos los tipos</option>
          {Object.entries(KIND_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          name="deporte"
          defaultValue={sp.deporte ?? ''}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Todos los deportes</option>
          {deportes.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select
          name="categoria"
          defaultValue={sp.categoria ?? ''}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>{c.sport} {c.label}</option>
          ))}
        </select>
        <Button type="submit" variant="outline">Filtrar</Button>
        {(sp.deporte || sp.categoria || sp.tipo) && (
          <Button render={<Link href={`/${slug}/calendario`} />} variant="ghost">
            Limpiar
          </Button>
        )}
      </form>

      {eventos.length === 0 && (
        <div className="mt-8 flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm font-medium">No hay eventos próximos</p>
          {puedeEditar && (
            <p className="text-sm text-muted-foreground">
              Creá el primero y la categoría va a aparecer acá.
            </p>
          )}
        </div>
      )}

      {[...eventosPorDia.entries()].map(([dia, eventosDelDia]) => (
        <section key={dia} className="mt-6">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {formatDia(dia)}
          </h2>
          <Table>
            <TableBody>
              {eventosDelDia.map((e) => (
                <TableRow key={e.id} className="h-11">
                  <TableCell className="w-40 whitespace-nowrap text-sm text-muted-foreground">
                    {formatDate(e.startsAt, club.timezone)}
                  </TableCell>
                  <TableCell className="w-32">
                    <Badge
                      variant="outline"
                      style={{ borderColor: `${KIND_COLORS[e.kind] ?? '#6b7280'}55`, color: KIND_COLORS[e.kind] ?? '#6b7280' }}
                    >
                      {KIND_LABELS[e.kind] ?? e.kind}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Link href={`/${slug}/calendario/${e.id}`} className="font-medium hover:underline">
                      {e.title}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                    {e.categoriaLabel && `${e.deporte} ${e.categoriaLabel}`}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                    {e.opponent && `vs ${e.opponent}`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ))}
    </main>
  )
}
