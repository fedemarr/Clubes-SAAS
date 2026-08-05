import { and, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarDays, CreditCard, MapPin, TrendingDown, Trophy } from 'lucide-react'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { rolesEnClub } from '@/lib/permissions'
import { formatARS } from '@/lib/money'
import { datosPortal, type CuentaPortal } from '@/modules/portal/queries'
import { PagoPortalButton } from '@/modules/portal/components/PagoPortalButton'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/empty-state'

export const dynamic = 'force-dynamic'

const KIND_LABEL: Record<string, string> = {
  entrenamiento: 'Entrenamiento',
  partido: 'Partido',
  cena: 'Cena',
  asamblea: 'Asamblea',
  buffet: 'Turno de buffet',
}

const CARGO_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  parcial: 'Parcial',
  vencido: 'Vencido',
}

function formatearFecha(fecha: Date, timezone: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }).format(fecha)
}

function CuentaCard({ slug, cuenta }: { slug: string; cuenta: CuentaPortal }) {
  const alDia = cuenta.balanceCents <= 0
  const vencidos = cuenta.cargos.filter((c) => c.status === 'vencido')
  const porVencer = cuenta.cargos.filter((c) => c.status !== 'vencido')

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold tracking-tight">{cuenta.label ?? cuenta.holderNombre}</p>
          <p className="text-xs text-muted-foreground">{cuenta.holderNombre}</p>
        </div>
        <Badge variant={alDia ? 'outline' : 'destructive'}>{alDia ? 'Al día' : 'Con deuda'}</Badge>
      </div>

      <p className={`mt-4 text-3xl font-semibold tabular-nums ${alDia ? '' : 'text-destructive'}`}>
        {formatARS(cuenta.balanceCents)}
      </p>
      <p className="text-xs text-muted-foreground">{alDia ? 'Sin deuda en la cuenta' : 'Saldo pendiente'}</p>

      {cuenta.cargos.length > 0 && (
        <ul className="mt-4 divide-y text-sm">
          {cuenta.cargos.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate">{c.concept}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-muted-foreground">{formatARS(c.amountCents)}</span>
                <Badge variant={c.status === 'vencido' ? 'destructive' : 'outline'}>
                  {CARGO_LABEL[c.status] ?? c.status}
                </Badge>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        <PagoPortalButton clubSlug={slug} accountId={cuenta.accountId} montoCents={cuenta.balanceCents} />
        {cuenta.balanceCents > 0 && (
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Se paga con Mercado Pago (o transferencia al CVU del club). Se acredita automáticamente.
          </p>
        )}
      </div>

      {vencidos.length > 0 && (
        <p className="mt-3 text-xs text-destructive">
          {vencidos.length} {vencidos.length === 1 ? 'cargo vencido' : 'cargos vencidos'} · el club te avisa por
          WhatsApp. {porVencer.length === 0 && 'Podés organizar un plan de pago hablando con el club.'}
        </p>
      )}
    </section>
  )
}

export default async function PortalHomePage({ params }: { params: Promise<{ club: string }> }) {
  const { club: slug } = await params

  const ctx = await rolesEnClub(slug)
  if (!ctx) redirect('/')

  const [club] = await db
    .select()
    .from(clubs)
    .where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)))
    .limit(1)
  if (!club) redirect('/')

  const datos = await datosPortal(ctx.clubId, ctx.personId)
  const deudaTotal = datos.cuentas.reduce((acc, c) => acc + Math.max(0, c.balanceCents), 0)

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Hola, {datos.persona.firstName || 'socio'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {datos.cuentas.length === 0
            ? 'Tu cuenta todavía no tiene movimientos.'
            : deudaTotal > 0
              ? `Tenés ${formatARS(deudaTotal)} pendientes en total.`
              : 'Estás al día con el club.'}
        </p>
      </div>

      {datos.proximoEvento ? (
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <CalendarDays className="size-4 text-primary" />
            Próximo evento
          </div>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold tracking-tight">
                {datos.proximoEvento.title ?? KIND_LABEL[datos.proximoEvento.kind] ?? 'Evento'}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span>{formatearFecha(datos.proximoEvento.startsAt, club.timezone)}</span>
                {datos.proximoEvento.categoriaLabel && (
                  <span className="inline-flex items-center gap-1">
                    <Trophy className="size-3.5" />
                    {datos.proximoEvento.categoriaLabel}
                  </span>
                )}
                {datos.proximoEvento.opponent && <span>vs. {datos.proximoEvento.opponent}</span>}
                {datos.proximoEvento.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5" />
                    {datos.proximoEvento.location}
                  </span>
                )}
              </p>
            </div>
            <Badge variant="outline">{KIND_LABEL[datos.proximoEvento.kind] ?? datos.proximoEvento.kind}</Badge>
          </div>
        </section>
      ) : (
        <EmptyState
          title="Sin próximos eventos"
          description="Cuando te programen un entrenamiento o partido, lo vas a ver acá."
          icon={CalendarDays}
        />
      )}

      {datos.cuentas.length > 0 ? (
        <div className="grid gap-4">
          {datos.cuentas.map((c) => (
            <CuentaCard key={c.accountId} slug={slug} cuenta={c} />
          ))}
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <CreditCard className="size-3.5" />
            ¿Querés ver todo el detalle?
            <Link href={`/${slug}/portal/pagos`} className="font-medium text-primary underline-offset-4 hover:underline">
              Andá a Pagos
            </Link>
          </p>
        </div>
      ) : (
        <section className="rounded-xl border border-dashed bg-card/50 p-6 text-center">
          <TrendingDown className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Todavía no tenés ninguna cuenta asociada. Hablá con el club si creés que es un error.
          </p>
        </section>
      )}
    </div>
  )
}
