import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, eq, isNull } from 'drizzle-orm'
import { AlertTriangle, Wallet } from 'lucide-react'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { checkPermission } from '@/lib/permissions'
import { formatARS } from '@/lib/money'
import {
  deudoresMorosidad,
  historialContactos,
  listarPlantillas,
  listarPlanesDePago,
  listarReglasCobranza,
  listarSugerenciasPendientes,
  resumenMorosidad,
} from '@/modules/morosidad/queries'
import { MorosidadPanel } from '@/modules/morosidad/components/MorosidadPanel'
import { CuotasNav } from '@/modules/cuotas/components/CuotasNav'
import { PageHeader } from '@/components/page-header'
import { StatCard } from '@/components/stat-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const NOMBRE_TRAMO: Record<string, string> = {
  1: 'Menos de 1 mes',
  2: '1 mes',
  3: '2 meses',
  4: '3+ meses',
}

export default async function MorosidadPage({
  params,
}: {
  params: Promise<{ club: string }>
}) {
  const { club: slug } = await params

  const ctx = await checkPermission('morosidad.ver', { kind: 'club' }, slug)
  if (!ctx) {
    return <main className="px-4 py-6 text-muted-foreground">No tenés permiso para ver la morosidad.</main>
  }

  const [club] = await db
    .select()
    .from(clubs)
    .where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)))
    .limit(1)
  if (!club) notFound()

  const puedeConfigurar = await checkPermission('morosidad.configurar', { kind: 'club' }, slug)

  const [resumen, reglas, plantillas, sugerencias, planes, deudores, historial] = await Promise.all([
    resumenMorosidad(ctx.clubId),
    listarReglasCobranza(ctx.clubId),
    listarPlantillas(ctx.clubId),
    listarSugerenciasPendientes(ctx.clubId),
    listarPlanesDePago(ctx.clubId),
    deudoresMorosidad(ctx.clubId, { top: 500 }),
    historialContactos(ctx.clubId, { limit: 50 }),
  ])

  const maxEvolucion = resumen.evolucionMensual.reduce((acc, e) => Math.max(acc, e.deudaCents), 0)

  return (
    <main>
      <PageHeader
        title="Morosidad"
        description="Deuda por antigüedad, reglas de cobranza y planes de pago."
        actions={
          <Button render={<Link href={`/${slug}/cuotas/cobranzas`} />} variant="outline">
            Cobranzas
          </Button>
        }
      />

      <div className="mt-6">
        <CuotasNav clubSlug={slug} />
      </div>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Deuda total"
          value={formatARS(resumen.deudaTotalCents)}
          hint={`${resumen.cuentasDeudoras} cuentas deudoras`}
          icon={Wallet}
          accent="danger"
        />
        {([1, 2, 3, 4] as const).map((t) => (
          <StatCard
            key={t}
            label={`Tramo · ${NOMBRE_TRAMO[t]}`}
            value={formatARS(resumen.tramos[t].montoCents)}
            hint={`${resumen.tramos[t].cuentas} cuentas`}
          />
        ))}
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Deuda por deporte
          </h2>
          {resumen.porDeporte.length === 0 ? (
            <EmptyState title="Sin datos." className="py-8" />
          ) : (
            <div className="overflow-hidden rounded-lg border">
              {resumen.porDeporte.map((d) => (
                <div key={d.deporte} className="flex items-center justify-between border-b px-3 py-2.5 text-sm last:border-0">
                  <span className="font-medium capitalize">{d.deporte}</span>
                  <span className="tabular-nums">
                    {formatARS(d.montoCents)} <span className="text-muted-foreground">· {d.cuentas} cuentas</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Evolución mensual
          </h2>
          {resumen.evolucionMensual.length === 0 ? (
            <EmptyState title="Sin datos." className="py-8" />
          ) : (
            <div className="space-y-2">
              {resumen.evolucionMensual.map((e) => {
                const ancho = maxEvolucion > 0 ? Math.max(4, Math.round((e.deudaCents / maxEvolucion) * 100)) : 0
                return (
                  <div key={e.mes} className="flex items-center gap-3">
                    <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">{e.mes}</span>
                    <div className="h-3 flex-1 overflow-hidden rounded-sm bg-muted">
                      <div
                        className="h-full rounded-sm bg-primary/70"
                        style={{ width: `${ancho}%` }}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right text-xs font-medium tabular-nums">
                      {formatARS(e.deudaCents)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Las 20 cuentas que más deben
        </h2>
        {resumen.top20.length === 0 ? (
          <EmptyState title="No hay deudores. Todo al día." className="py-10" />
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead className="hidden sm:table-cell">Antigüedad</TableHead>
                  <TableHead className="hidden sm:table-cell">Deportes</TableHead>
                  <TableHead className="text-right">Deuda</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resumen.top20.map((d, i) => (
                  <TableRow key={d.accountId}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>
                      <p className="font-medium">{d.holderApellido}, {d.holderNombre}</p>
                      {d.label && <p className="text-xs text-muted-foreground">{d.label}</p>}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant={d.tramo >= 3 ? 'destructive' : d.tramo === 2 ? 'secondary' : 'outline'}>
                        {NOMBRE_TRAMO[d.tramo]}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden capitalize sm:table-cell">
                      {d.deportes.join(', ') || '—'}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatARS(d.deudaCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {sugerencias.length > 0 && (
        <section className="mt-8 rounded-lg border border-amber-500/40 bg-amber-50 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <AlertTriangle className="size-4" /> Sugerencias de suspensión pendientes
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            La suspensión nunca es automática. Revisá y confirmá cada una antes de suspender el carnet.
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-amber-900">
            {sugerencias.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3">
                <span>
                  {s.holderApellido}, {s.holderNombre} · {formatARS(s.deudaCents)}
                </span>
                <span className="text-xs text-amber-700">{s.ruleName ?? 'Regla de suspensión'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <MorosidadPanel
        clubSlug={slug}
        puedeConfigurar={Boolean(puedeConfigurar)}
        reglas={reglas}
        plantillas={plantillas}
        planes={planes.map((p) => ({
          ...p,
          createdAt: p.createdAt.toISOString(),
          primeraFecha: p.primeraFecha,
        }))}
        deudores={deudores.map((d) => ({
          accountId: d.accountId,
          label: `${d.holderApellido}, ${d.holderNombre}`,
          deudaCents: d.deudaCents,
        }))}
        sugerencias={sugerencias.map((s) => ({
          ...s,
          deliveredAt: s.deliveredAt.toISOString(),
        }))}
        historial={historial.map((h) => ({
          ...h,
          deliveredAt: h.deliveredAt.toISOString(),
          resolvedAt: h.resolvedAt ? h.resolvedAt.toISOString() : null,
        }))}
      />
    </main>
  )
}
