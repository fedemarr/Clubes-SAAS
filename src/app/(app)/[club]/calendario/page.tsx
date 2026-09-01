import { and, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { CalendarDays, ChevronLeft, ChevronRight, List } from 'lucide-react'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { checkPermission } from '@/lib/permissions'
import { listarEventos, listarCategoriasActivas, listarDeportes } from '@/modules/eventos/queries'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

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

function formatDate(iso: string | Date, tz: string): string {
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

/** Fecha local del club como YYYY-MM-DD (para agrupar por día en la vista mes). */
function diaLocal(iso: string | Date, tz: string): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso))
  const get = (t: string) => p.find((x) => x.type === t)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

function construirGrillaMes(anio: number, mes: number) {
  const primerDia = new Date(anio, mes, 1)
  const offset = (primerDia.getDay() + 6) % 7 // lunes = 0
  const diasEnMes = new Date(anio, mes + 1, 0).getDate()
  const celdas: (Date | null)[] = []
  for (let i = 0; i < offset; i++) celdas.push(null)
  for (let d = 1; d <= diasEnMes; d++) celdas.push(new Date(anio, mes, d))
  return celdas
}

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export default async function CalendarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ club: string }>
  searchParams: Promise<{ deporte?: string; categoria?: string; tipo?: string; vista?: string; mes?: string }>
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

  const vistaMes = sp.vista === 'mes'

  // Mes a mostrar (para la vista mes). Por defecto el mes actual del club.
  const hoyLocal = new Date(
    new Intl.DateTimeFormat('en-US', { timeZone: club.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
  )
  let anioMes: { anio: number; mes: number } = { anio: hoyLocal.getFullYear(), mes: hoyLocal.getMonth() }
  if (sp.mes && /^\d{4}-\d{2}$/.test(sp.mes)) {
    const [a, m] = sp.mes.split('-').map(Number)
    anioMes = { anio: a, mes: m - 1 }
  }

  let desde: Date | undefined
  let hasta: Date | undefined
  if (vistaMes) {
    desde = new Date(anioMes.anio, anioMes.mes, 1)
    hasta = new Date(anioMes.anio, anioMes.mes + 1, 0, 23, 59, 59)
  }

  const eventos = await listarEventos(club.id, {
    deporte: sp.deporte,
    categoriaId: sp.categoria,
    kind: sp.tipo as (typeof import('@/db/schema').eventKind.enumValues)[number] | undefined,
    teamIds: ctx.scopeTeamIds.length > 0 ? ctx.scopeTeamIds : null,
    desde,
    hasta,
  })

  const deportes = await listarDeportes(club.id)
  const categorias = await listarCategoriasActivas(club.id)

  const eventosPorDia = Map.groupBy(eventos, (e) => diaLocal(e.startsAt, club.timezone))
  const anioPrev = anioMes.mes === 0 ? anioMes.anio - 1 : anioMes.anio
  const mesPrev = anioMes.mes === 0 ? 11 : anioMes.mes - 1
  const anioNext = anioMes.mes === 11 ? anioMes.anio + 1 : anioMes.anio
  const mesNext = anioMes.mes === 11 ? 0 : anioMes.mes + 1
  const queryComun = `${sp.deporte ? `&deporte=${sp.deporte}` : ''}${sp.categoria ? `&categoria=${sp.categoria}` : ''}${sp.tipo ? `&tipo=${sp.tipo}` : ''}`

  return (
    <main>
      <PageHeader
        title="Calendario"
        description={vistaMes ? 'Vista mensual del club' : 'Próximos eventos del club'}
        actions={
          <>
            <div className="flex items-center gap-1 rounded-lg border bg-card p-0.5">
              <Button
                render={<Link href={`/${slug}/calendario?vista=lista${queryComun}`} />}
                size="sm"
                variant={vistaMes ? 'ghost' : 'default'}
                className="h-7"
              >
                <List className="size-3.5" />
              </Button>
              <Button
                render={<Link href={`/${slug}/calendario?vista=mes${queryComun}`} />}
                size="sm"
                variant={vistaMes ? 'default' : 'ghost'}
                className="h-7"
              >
                <CalendarDays className="size-3.5" />
                Mes
              </Button>
            </div>
            {puedeEditar && (
              <Button render={<Link href={`/${slug}/calendario/nuevo`} />}>Nuevo evento</Button>
            )}
          </>
        }
      />

      <form method="get" className="mt-6 flex flex-wrap items-center gap-2">
        <input type="hidden" name="vista" value={vistaMes ? 'mes' : 'lista'} />
        {vistaMes && <input type="hidden" name="mes" value={`${anioMes.anio}-${String(anioMes.mes + 1).padStart(2, '0')}`} />}
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
          <Button render={<Link href={`/${slug}/calendario?${vistaMes ? 'vista=mes' : 'vista=lista'}`} />} variant="ghost">
            Limpiar
          </Button>
        )}
      </form>

      {eventos.length === 0 && (
        <EmptyState
          className="mt-8"
          title={vistaMes ? 'No hay eventos en este mes' : 'No hay eventos próximos'}
          description={puedeEditar ? 'Creá el primero y va a aparecer acá.' : undefined}
        />
      )}

      {vistaMes ? (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <Button
              render={
                <Link href={`/${slug}/calendario?vista=mes&mes=${anioPrev}-${String(mesPrev + 1).padStart(2, '0')}${queryComun}`} />
              }
              variant="outline"
              size="sm"
            >
              <ChevronLeft className="size-4" />
              Prev
            </Button>
            <h2 className="text-sm font-semibold capitalize">
              {new Date(anioMes.anio, anioMes.mes, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
            </h2>
            <Button
              render={
                <Link href={`/${slug}/calendario?vista=mes&mes=${anioNext}-${String(mesNext + 1).padStart(2, '0')}${queryComun}`} />
              }
              variant="outline"
              size="sm"
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="hidden grid-cols-7 border-b bg-muted/50 sm:grid">
              {DIAS_SEMANA.map((d) => (
                <div key={d} className="px-2 py-2 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {construirGrillaMes(anioMes.anio, anioMes.mes).map((celda, i) => {
                if (!celda) return <div key={`n${i}`} className="min-h-20 border-b border-r bg-muted/20 sm:min-h-24" />
                const diaKey = diaLocal(celda, club.timezone)
                const delDia = eventosPorDia.get(diaKey) ?? []
                const hoyDia = diaLocal(new Date(), club.timezone) === diaKey
                return (
                  <div
                    key={i}
                    className={cn(
                      'flex min-h-20 flex-col gap-1 border-b border-r p-1.5 sm:min-h-24',
                      hoyDia && 'bg-primary/5',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-6 items-center justify-center rounded-full text-xs font-medium',
                        hoyDia ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {celda.getDate()}
                    </span>
                    {delDia.slice(0, 3).map((e) => (
                      <Link
                        key={e.id}
                        href={`/${slug}/calendario/${e.id}`}
                        className="truncate rounded px-1 py-0.5 text-[10px] font-medium leading-tight hover:underline"
                        style={{
                          color: KIND_COLORS[e.kind] ?? '#6b7280',
                          backgroundColor: `${KIND_COLORS[e.kind] ?? '#6b7280'}1a`,
                        }}
                      >
                        {e.title}
                      </Link>
                    ))}
                    {delDia.length > 3 && (
                      <span className="px-1 text-[10px] text-muted-foreground">+{delDia.length - 3} más</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : (
        [...eventosPorDia.entries()].map(([dia, eventosDelDia]) => (
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
        ))
      )}
    </main>
  )
}