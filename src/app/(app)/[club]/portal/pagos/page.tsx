import { and, eq, isNull } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { rolesEnClub } from '@/lib/permissions'
import { formatARS } from '@/lib/money'
import { datosPortal, ultimosMovimientosPortal } from '@/modules/portal/queries'
import { PagoPortalButton } from '@/modules/portal/components/PagoPortalButton'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/empty-state'

export const dynamic = 'force-dynamic'

export default async function PortalPagosPage({ params }: { params: Promise<{ club: string }> }) {
  const { club: slug } = await params

  const ctx = await rolesEnClub(slug)
  if (!ctx) redirect('/')

  const [club] = await db
    .select()
    .from(clubs)
    .where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)))
    .limit(1)
  if (!club) redirect('/')

  const [datos, movimientos] = await Promise.all([
    datosPortal(ctx.clubId, ctx.personId),
    ultimosMovimientosPortal(ctx.clubId, ctx.personId),
  ])

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Wallet className="size-6 text-primary" />
          Pagos
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cargos de la cuenta familiar y últimos movimientos. Pagás online con Mercado Pago.
        </p>
      </div>

      {datos.cuentas.length === 0 ? (
        <EmptyState
          title="No hay ninguna cuenta asociada"
          description="Cuando el club te dé de alta, vas a ver acá tus cuotas y pagos."
          icon={Wallet}
        />
      ) : (
        datos.cuentas.map((cuenta) => {
          const alDia = cuenta.balanceCents <= 0
          return (
            <section key={cuenta.accountId} className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold tracking-tight">
                    {cuenta.label ?? cuenta.holderNombre}
                  </p>
                  <p className="text-xs text-muted-foreground">{cuenta.holderNombre}</p>
                </div>
                <Badge variant={alDia ? 'outline' : 'destructive'}>
                  {alDia ? 'Al día' : formatARS(cuenta.balanceCents) + ' pendientes'}
                </Badge>
              </div>

              {cuenta.cargos.length > 0 ? (
                <ul className="mt-4 divide-y text-sm">
                  {cuenta.cargos.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate">{c.concept}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.period} · vence {new Date(c.dueOn + 'T12:00:00Z').toLocaleDateString('es-AR')}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="tabular-nums">{formatARS(c.amountCents)}</span>
                        <Badge variant={c.status === 'vencido' ? 'destructive' : 'outline'}>{c.status}</Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">No hay cargos pendientes.</p>
              )}

              <div className="mt-4 border-t pt-4">
                <PagoPortalButton clubSlug={slug} accountId={cuenta.accountId} montoCents={cuenta.balanceCents} />
              </div>
            </section>
          )
        })
      )}

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <p className="text-sm font-semibold tracking-tight">Últimos movimientos</p>
        {movimientos.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Todavía no hay movimientos.</p>
        ) : (
          <ul className="mt-3 divide-y text-sm">
            {movimientos.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  {m.direction === 'credito' ? (
                    <ArrowDownLeft className="size-4 shrink-0 text-green-600" />
                  ) : (
                    <ArrowUpRight className="size-4 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate capitalize">
                      {m.direction === 'credito' ? (m.memo ?? 'Pago acreditado') : (m.memo ?? 'Cargo')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Intl.DateTimeFormat('es-AR', {
                        day: 'numeric',
                        month: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                        timeZone: club.timezone,
                      }).format(m.bookedAt)}
                    </p>
                  </div>
                </div>
                <span className={`shrink-0 tabular-nums ${m.direction === 'credito' ? 'text-green-600' : ''}`}>
                  {m.direction === 'credito' ? '+' : '-'}
                  {formatARS(m.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
