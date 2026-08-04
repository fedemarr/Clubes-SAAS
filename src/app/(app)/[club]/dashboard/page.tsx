import Link from 'next/link'
import { and, eq, isNull } from 'drizzle-orm'
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  HandCoins,
  ShieldAlert,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { checkPermission } from '@/lib/permissions'
import { formatARS } from '@/lib/money'
import { buscarPersonas } from '@/modules/personas/queries'
import { listarCategorias } from '@/modules/categorias/queries'
import { listarPlanesVigentes, listarCuentasConSaldo } from '@/modules/cuotas/queries'
import { listarEventos } from '@/modules/eventos/queries'
import { cajaDelDia } from '@/modules/cobranzas/queries'
import { StatCard } from '@/components/stat-card'

type QuickLink = { href: string; titulo: string; desc: string; icon: typeof Users }

function rangoDiaLocal(timezone: string, ahora = new Date()): { desde: Date; hasta: Date } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const [y, m, d] = fmt.format(ahora).split('-').map(Number)
  return {
    desde: new Date(Date.UTC(y, m - 1, d)),
    hasta: new Date(Date.UTC(y, m - 1, d + 1)),
  }
}

export default async function DashboardPage({ params }: { params: Promise<{ club: string }> }) {
  const { club: slug } = await params

  const [club] = await db
    .select()
    .from(clubs)
    .where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)))
    .limit(1)
  if (!club) return null

  const [verPersonas, verCategorias, verCuotas, verCobranzas, verCalendario] = await Promise.all([
    checkPermission('personas.ver', { kind: 'club' }, slug),
    checkPermission('categorias.ver', { kind: 'club' }, slug),
    checkPermission('cuotas.ver', { kind: 'club' }, slug),
    checkPermission('cobranzas.ver', { kind: 'club' }, slug),
    checkPermission('calendario.ver', { kind: 'club' }, slug),
  ])

  const [personas, categorias, planes, cuentas, eventos, cobrosHoy] = await Promise.all([
    verPersonas ? buscarPersonas(club.id, {}) : Promise.resolve([]),
    verCategorias ? listarCategorias(club.id, { soloActivas: true }) : Promise.resolve([]),
    verCuotas ? listarPlanesVigentes(club.id) : Promise.resolve([]),
    verCuotas ? listarCuentasConSaldo(club.id) : Promise.resolve([]),
    verCalendario ? listarEventos(club.id) : Promise.resolve([]),
    verCobranzas ? cajaDelDia(club.id, ...(Object.values(rangoDiaLocal(club.timezone)) as [Date, Date])) : Promise.resolve([]),
  ])

  const activos = personas.filter((p) => p.status === 'activo').length
  const deudaCents = cuentas.reduce((acc, c) => acc + Math.max(0, c.balanceCents), 0)
  const cobradoHoyCents = cobrosHoy.reduce((acc, c) => acc + c.montoCents, 0)
  const proximoEvento = eventos[0]

  const accesos: QuickLink[] = [
    {
      href: '/personas',
      titulo: 'Padrón',
      desc: verPersonas ? `${personas.length} personas registradas` : 'Buscar personas',
      icon: Users,
    },
    {
      href: '/categorias',
      titulo: 'Categorías',
      desc: verCategorias ? `${categorias.length} activas` : 'Deportes y planteles',
      icon: Trophy,
    },
    {
      href: '/calendario',
      titulo: 'Calendario',
      desc: proximoEvento?.title ?? 'Eventos y convocatorias',
      icon: CalendarDays,
    },    {
      href: '/cuotas',
      titulo: 'Cuotas',
      desc: verCuotas ? `${planes.length} planes vigentes` : 'Planes y cuenta corriente',
      icon: Wallet,
    },
  ].filter((s) => s.href !== '/cuotas' || verCuotas)

  const fechaHoy = new Intl.DateTimeFormat('es-AR', {
    timeZone: club.timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())

  return (
    <main>
      <div className="flex items-center gap-3">
        {club.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={club.logoUrl}
            alt=""
            width={44}
            height={44}
            className="rounded-xl ring-1 ring-foreground/10"
          />
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{club.name}</h1>
          <p className="text-sm text-muted-foreground capitalize">{fechaHoy}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {verPersonas && (
          <StatCard
            label="Personas activas"
            value={activos}
            hint={`${personas.length} en el padrón`}
            icon={Users}
          />
        )}
        {verCategorias && (
          <StatCard label="Categorías activas" value={categorias.length} icon={Trophy} />
        )}
        {verCuotas && (
          <StatCard
            label="Deuda total"
            value={formatARS(deudaCents)}
            hint={`${cuentas.filter((c) => c.balanceCents > 0).length} cuentas deudoras`}
            icon={ShieldAlert}
            accent={deudaCents > 0 ? 'danger' : 'success'}
          />
        )}
        {verCobranzas && (
          <StatCard
            label="Cobrado hoy"
            value={formatARS(cobradoHoyCents)}
            hint={`${cobrosHoy.length} cobros`}
            icon={HandCoins}
            accent={cobradoHoyCents > 0 ? 'success' : 'default'}
          />
        )}
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Módulos</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {accesos.map((s) => (
            <Link
              key={s.href}
              href={`/${slug}${s.href}`}
              className="group flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs transition-colors hover:border-primary/40"
            >
              <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <s.icon className="size-4" />
              </div>
              <div>
                <p className="text-sm font-medium">{s.titulo}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{s.desc}</p>
              </div>
              <span className="mt-auto flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors group-hover:text-primary">
                Abrir
                <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {verCalendario && (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight">Próximo evento</h2>
            <Link
              href={`/${slug}/calendario`}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Ver calendario
            </Link>
          </div>
          {proximoEvento ? (
            <div className="flex items-center gap-4 rounded-xl border bg-card p-4 shadow-xs">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {proximoEvento.kind === 'partido' ? <Trophy className="size-5" /> : <Clock3 className="size-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{proximoEvento.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {proximoEvento.categoriaLabel ?? 'Sin categoría'} · {proximoEvento.location ?? 'Sin lugar'}
                </p>
              </div>
              <div className="shrink-0 text-right text-xs text-muted-foreground">
                <p className="font-medium text-foreground">
                  {new Intl.DateTimeFormat('es-AR', {
                    timeZone: club.timezone,
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  }).format(proximoEvento.startsAt)}
                </p>
                <p>
                  {new Intl.DateTimeFormat('es-AR', {
                    timeZone: club.timezone,
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(proximoEvento.startsAt)}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 shrink-0" />
              No hay eventos próximos cargados.
            </div>
          )}
        </section>
      )}
    </main>
  )
}
