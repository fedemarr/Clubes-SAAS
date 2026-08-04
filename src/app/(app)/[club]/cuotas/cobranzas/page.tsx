import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { checkPermission } from '@/lib/permissions'
import { formatARS } from '@/lib/money'
import { cajaDelDia } from '@/modules/cobranzas/queries'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'

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

export default async function CobranzasPage({
  params,
}: {
  params: Promise<{ club: string }>
}) {
  const { club: slug } = await params

  const ctx = await checkPermission('cobranzas.ver', { kind: 'club' }, slug)
  if (!ctx) {
    return <main className="px-4 py-6 text-muted-foreground">No tenés permiso para ver cobranzas.</main>
  }

  const [club] = await db
    .select()
    .from(clubs)
    .where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)))
    .limit(1)
  if (!club) notFound()

  const puedeRegistrar = await checkPermission('cobranzas.registrar', { kind: 'club' }, slug)
  const puedeConciliar = await checkPermission('cobranzas.conciliar', { kind: 'club' }, slug)

  const { desde, hasta } = rangoDiaLocal(club.timezone)
  const cobrosHoy = await cajaDelDia(club.id, desde, hasta)

  const porCobrador = new Map<string, { nombre: string; cantidad: number; totalCents: number }>()
  for (const c of cobrosHoy) {
    const key = c.cobradorNombre ? `${c.cobradorApellido}, ${c.cobradorNombre}` : 'Sin identificar'
    const actual = porCobrador.get(key) ?? { nombre: key, cantidad: 0, totalCents: 0 }
    actual.cantidad += 1
    actual.totalCents += c.montoCents
    porCobrador.set(key, actual)
  }
  const totalHoy = cobrosHoy.reduce((acc, c) => acc + c.montoCents, 0)

  const fechaHoy = new Intl.DateTimeFormat('es-AR', {
    timeZone: club.timezone,
    day: '2-digit',
    month: 'long',
    weekday: 'long',
  }).format(new Date())

  return (
    <main>
      <PageHeader
        title="Cobranzas"
        description={`${fechaHoy.charAt(0).toUpperCase()}${fechaHoy.slice(1)}`}
        actions={
          <>
            {puedeRegistrar && (
              <Button render={<Link href={`/${slug}/cuotas/cobrar`} />}>Cobrar</Button>
            )}
            {puedeConciliar && (
              <Button render={<Link href={`/${slug}/cuotas/conciliar`} />} variant="outline">
                Conciliar
              </Button>
            )}
          </>
        }
      />

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Caja del día · efectivo
        </h2>

        {cobrosHoy.length === 0 ? (
          <EmptyState title="Todavía no se registró ningún cobro en efectivo hoy." className="py-10" />
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Total del día</p>
                <p className="text-xl font-semibold tabular-nums">{formatARS(totalHoy)}</p>
              </div>
              {[...porCobrador.values()].map((p) => (
                <div key={p.nombre} className="rounded-lg border p-3">
                  <p className="truncate text-xs text-muted-foreground">{p.nombre}</p>
                  <p className="text-xl font-semibold tabular-nums">{formatARS(p.totalCents)}</p>
                  <p className="text-xs text-muted-foreground">{p.cantidad} cobros</p>
                </div>
              ))}
            </div>

            <Table>
              <TableBody>
                {cobrosHoy.map((c) => (
                  <TableRow key={c.id} className="h-11">
                    <TableCell className="w-32 whitespace-nowrap text-sm text-muted-foreground">
                      {new Intl.DateTimeFormat('es-AR', { timeZone: club.timezone, hour: '2-digit', minute: '2-digit' }).format(c.paidAt)}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {c.cuentaLabel ?? `${c.holderApellido}, ${c.holderNombre}`}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                      {c.cobradorNombre ? `${c.cobradorApellido}, ${c.cobradorNombre}` : '—'}
                    </TableCell>
                    <TableCell className="w-36 text-right tabular-nums">
                      {formatARS(c.montoCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </section>
    </main>
  )
}
