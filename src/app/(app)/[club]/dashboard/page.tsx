import Link from 'next/link'
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  HandCoins,
  ShieldAlert,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react'
import { checkPermission, rolesEnClub } from '@/lib/permissions'
import { formatARS } from '@/lib/money'
import { StatCard } from '@/components/stat-card'
import { Barra } from '@/modules/dashboards/components/bar-chart'
import { SectionCard } from '@/modules/dashboards/components/section-card'
import { cargarDashboard } from '@/modules/dashboards/queries'

type QuickLink = { href: string; titulo: string; desc: string; icon: typeof Users }

const DIAS_SEMANA_FMT = new Intl.DateTimeFormat('es-AR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})
const HORA_FMT = new Intl.DateTimeFormat('es-AR', {
  hour: '2-digit',
  minute: '2-digit',
})

const TRAMOS_LABEL: Record<'1' | '2' | '3' | '4', string> = {
  1: '1-3 meses',
  2: '3-6 meses',
  3: '6-12 meses',
  4: '> 12 meses',
}

export default async function DashboardPage({ params }: { params: Promise<{ club: string }> }) {
  const { club: slug } = await params
  const ctx = await rolesEnClub(slug)
  if (!ctx) return null

  const [verPersonas, verCategorias, verCuotas, verCobranzas, verCalendario, verMorosidad, verDocumentos] =
    await Promise.all([
      checkPermission('personas.ver', { kind: 'club' }, slug),
      checkPermission('categorias.ver', { kind: 'club' }, slug),
      checkPermission('cuotas.ver', { kind: 'club' }, slug),
      checkPermission('cobranzas.ver', { kind: 'club' }, slug),
      checkPermission('calendario.ver', { kind: 'club' }, slug),
      checkPermission('morosidad.ver', { kind: 'club' }, slug),
      checkPermission('documentos.ver', { kind: 'club' }, slug),
    ])

  const resumen = await cargarDashboard({
    slug,
    permisos: {
      verPersonas: Boolean(verPersonas),
      verCategorias: Boolean(verCategorias),
      verCuotas: Boolean(verCuotas),
      verCobranzas: Boolean(verCobranzas),
      verCalendario: Boolean(verCalendario),
      verMorosidad: Boolean(verMorosidad),
      verDocumentos: Boolean(verDocumentos),
    },
  })
  if (!resumen) return null

  const esPresidente = ctx.roles.includes('presidente')
  const esTesorero = ctx.roles.includes('tesorero')
  const esSecretaria = ctx.roles.includes('secretaria')
  const perspectivaFinanciera = verCuotas || verCobranzas

  const fechaHoy = new Intl.DateTimeFormat('es-AR', {
    timeZone: resumen.timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())

  const accesos: QuickLink[] = [
    {
      href: '/personas',
      titulo: 'Padrón',
      desc: verPersonas ? `${resumen.personasActivas} personas activas` : 'Buscar personas',
      icon: Users,
    },
    {
      href: '/categorias',
      titulo: 'Categorías',
      desc: verCategorias ? `${resumen.categoriasActivas} activas` : 'Deportes y planteles',
      icon: Trophy,
    },
    {
      href: '/calendario',
      titulo: 'Calendario',
      desc: resumen.proximosEventos[0]?.title ?? 'Eventos y convocatorias',
      icon: CalendarDays,
    },
    {
      href: '/cuotas',
      titulo: 'Cuotas',
      desc: verCuotas ? `${resumen.planesVigentes} planes vigentes` : 'Planes y cuenta corriente',
      icon: Wallet,
    },
  ].filter((s) => s.href !== '/cuotas' || verCuotas)

  return (
    <main>
      <div className="flex items-center gap-3">
        {resumen.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resumen.logoUrl}
            alt=""
            width={44}
            height={44}
            className="rounded-xl ring-1 ring-foreground/10"
          />
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{resumen.clubName}</h1>
          <p className="text-sm text-muted-foreground capitalize">{fechaHoy}</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {verPersonas && (
          <StatCard
            label="Personas activas"
            value={resumen.personasActivas}
            hint={`${resumen.personasTotales} en el padrón`}
            icon={Users}
          />
        )}
        {verCategorias && (
          <StatCard label="Categorías activas" value={resumen.categoriasActivas} icon={Trophy} />
        )}
        {verCuotas && (
          <StatCard
            label="Deuda total"
            value={formatARS(resumen.deudaTotalCents)}
            hint={`${resumen.cuentasDeudorasCount} cuentas deudoras`}
            icon={ShieldAlert}
            accent={resumen.deudaTotalCents > 0 ? 'danger' : 'success'}
          />
        )}
        {verCobranzas && (
          <StatCard
            label="Cobrado hoy"
            value={formatARS(resumen.cobradoHoyCents)}
            hint={`${resumen.cobrosHoyCount} cobros`}
            icon={HandCoins}
            accent={resumen.cobradoHoyCents > 0 ? 'success' : 'default'}
          />
        )}
      </div>

      {(esPresidente || esTesorero) && perspectivaFinanciera && resumen.morosidad && (
        <DashboardFinanciero resumen={resumen} slug={slug} />
      )}

      {esSecretaria && verDocumentos && resumen.documentosPendientes > 0 && (
        <DashboardDocumentos resumen={resumen} slug={slug} />
      )}

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

      {verCalendario && <ProximosEventos resumen={resumen} slug={slug} />}
    </main>
  )
}

function DashboardFinanciero(
  { resumen, slug }: {
    resumen: NonNullable<Awaited<ReturnType<typeof cargarDashboard>>>
    slug: string
  },
) {
  const tramos = resumen.morosidad!.tramos
  const maxTramo = Math.max(1, ...Object.values(tramos).map((t) => t.montoCents))
  const evolucion = resumen.morosidad!.evolucion
  const maxEvol = Math.max(1, ...evolucion.map((e) => e.deudaCents))

  return (
    <>
      <section className="mt-8 grid gap-4 lg:grid-cols-3">
        <SectionCard title="Morosidad por antigüedad" className="lg:col-span-1">
          <div className="space-y-3">
            {(['1', '2', '3', '4'] as const).map((k) => (
              <Barra
                key={k}
                label={TRAMOS_LABEL[k]}
                valor={tramos[k].montoCents}
                max={maxTramo}
                hint={`${tramos[k].cuentas} cuentas · ${formatARS(tramos[k].montoCents)}`}
              />
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Evolución de la deuda"
          className="lg:col-span-2"
          action={
            <Link
              href={`/${slug}/cuotas/morosidad`}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Ver morosidad
            </Link>
          }
        >
          {evolucion.length > 0 ? (
            <div className="flex h-32 items-end gap-1.5">
              {evolucion.map((e) => {
                const pct = maxEvol > 0 ? Math.round((e.deudaCents / maxEvol) * 100) : 0
                return (
                  <div key={e.mes} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {formatARS(e.deudaCents)}
                    </span>
                    <div
                      className="w-full rounded-t bg-primary/70"
                      style={{ height: `${Math.max(3, pct)}%` }}
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {e.mes.slice(5)}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyMini>Sin datos de evolución.</EmptyMini>
          )}
        </SectionCard>
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Mayores deudas"
          action={
            <Link
              href={`/${slug}/cuotas/cobranzas`}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Ver cobranzas
            </Link>
          }
        >
          {resumen.topDeudores.length > 0 ? (
            <ul className="space-y-2.5">
              {resumen.topDeudores.map((d) => (
                <li key={d.accountId} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm">
                    {d.holderNombre} {d.holderApellido}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-red-600">
                    {formatARS(d.balanceCents)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyMini>Sin cuentas deudoras 🎉</EmptyMini>
          )}
        </SectionCard>

        <SectionCard title="Cobros recientes">
          {resumen.pagosRecientes.length > 0 ? (
            <ul className="space-y-2.5">
              {resumen.pagosRecientes.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      {p.holderNombre} {p.holderApellido}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {p.method.replace('_', ' ')}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-green-600">
                      {formatARS(p.montoCents)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyMini>Sin cobros registrados.</EmptyMini>
          )}
        </SectionCard>
      </section>
    </>
  )
}

function DashboardDocumentos(
  { resumen, slug }: {
    resumen: NonNullable<Awaited<ReturnType<typeof cargarDashboard>>>
    slug: string
  },
) {
  return (
    <section className="mt-8">
      <SectionCard
        title="Documentos por revisar"
        action={
          <Link
            href={`/${slug}/documentos`}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Ver bandeja
          </Link>
        }
      >
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-yellow-500" />
            {resumen.documentosPendientes} pendientes
          </span>
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-red-500" />
            {resumen.documentosVencidos} vencidos
          </span>
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-green-500" />
            {resumen.documentosVigentes} vigentes
          </span>
          <span className="ml-auto flex items-center gap-1.5 text-muted-foreground">
            <FileText className="size-4" />
            {resumen.documentosPendientes + resumen.documentosVencidos} requieren atención
          </span>
        </div>
      </SectionCard>
    </section>
  )
}

function ProximosEventos(
  { resumen, slug }: {
    resumen: NonNullable<Awaited<ReturnType<typeof cargarDashboard>>>
    slug: string
  },
) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight">Próximos eventos</h2>
        <Link
          href={`/${slug}/calendario`}
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Ver calendario
        </Link>
      </div>
      {resumen.proximosEventos.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {resumen.proximosEventos.map((e) => (
            <div key={e.id} className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-xs">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {e.kind === 'partido' ? <Trophy className="size-5" /> : <Clock3 className="size-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{e.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {e.categoriaLabel ?? 'Sin categoría'} · {e.location ?? 'Sin lugar'}
                </p>
              </div>
              <div className="shrink-0 text-right text-xs text-muted-foreground">
                <p className="font-medium text-foreground">
                  {DIAS_SEMANA_FMT.format(e.startsAt)}
                </p>
                <p>{HORA_FMT.format(e.startsAt)}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 shrink-0" />
          No hay eventos próximos cargados.
        </div>
      )}
    </section>
  )
}

function EmptyMini({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}
