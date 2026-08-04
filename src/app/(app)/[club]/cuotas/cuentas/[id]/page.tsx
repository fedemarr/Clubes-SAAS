import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { checkPermission } from '@/lib/permissions'
import { decimalToCents, formatARS } from '@/lib/money'
import { cargosAbiertosDeCuenta, movimientosDeCuenta, obtenerCuenta } from '@/modules/cuotas/queries'
import { saldoDesdeMovimientos } from '@/modules/cuotas/service'
import { AnularCargoForm } from '@/modules/cuotas/components/AnularCargoForm'
import { AjusteCuentaForm } from '@/modules/cuotas/components/AjusteCuentaForm'
import { LinkDePagoForm } from '@/modules/cobranzas/components/LinkDePagoForm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const DIR_LABELS: Record<string, string> = { debito: 'Débito', credito: 'Crédito' }
const SOURCE_LABELS: Record<string, string> = {
  cargo: 'Cuota',
  pago: 'Pago',
  ajuste: 'Ajuste',
  reversion: 'Anulación',
}
const STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  parcial: 'Parcial',
  pagado: 'Pagado',
  vencido: 'Vencido',
  anulado: 'Anulado',
}

function formatFecha(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('es-AR', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric' }).format(d)
}

function periodLabel(period: string): string {
  const [, m] = period.split('-')
  return MESES[Number(m) - 1] ?? period
}

export default async function CuentaPage({
  params,
}: {
  params: Promise<{ club: string; id: string }>
}) {
  const { club: slug, id } = await params

  const ctx = await checkPermission('cuotas.ver', { kind: 'club' }, slug)
  if (!ctx) {
    return <main className="px-4 py-6 text-muted-foreground">No tenés permiso para ver cuotas.</main>
  }

  const puedeEmitir = await checkPermission('cuotas.emitir', { kind: 'club' }, slug)
  const puedeCobrar = await checkPermission('cobranzas.registrar', { kind: 'club' }, slug)

  const [club] = await db
    .select()
    .from(clubs)
    .where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)))
    .limit(1)
  if (!club) notFound()

  const cuenta = await obtenerCuenta(club.id, id)
  if (!cuenta) notFound()

  const [movimientos, abiertos] = await Promise.all([
    movimientosDeCuenta(club.id, id),
    cargosAbiertosDeCuenta(club.id, id),
  ])

  const saldoCalculado = saldoDesdeMovimientos(
    movimientos.map((m) => ({ direction: m.direction, amountCents: m.amountCents })),
  )

  return (
    <main>
      <Button render={<Link href={`/${slug}/cuotas/cuentas`} />} variant="ghost" className="mb-2 -ml-2">
        ← Cuenta corriente
      </Button>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {cuenta.label ?? `${cuenta.holder?.lastName}, ${cuenta.holder?.firstName}`}
          </h1>
          <p className="text-sm text-muted-foreground">Grupo familiar</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Saldo actual</p>
          <p className={`text-2xl font-semibold tabular-nums ${cuenta.balanceCents > 0 ? 'text-destructive' : 'text-green-700'}`}>
            {formatARS(cuenta.balanceCents)}
          </p>
        </div>
      </div>

      {abiertos.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Cargos abiertos
          </h2>
          <Table>
            <TableBody>
              {abiertos.map((c) => (
                <TableRow key={c.id} className="h-11">
                  <TableCell className="w-44 text-sm text-muted-foreground">
                    {periodLabel(c.period)} {c.period.slice(0, 4)}
                  </TableCell>
                  <TableCell className="text-sm font-medium">{c.concept}</TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                    vence {new Date(c.dueOn + 'T12:00:00Z').toLocaleDateString('es-AR')}
                  </TableCell>
                  <TableCell className="w-32 text-right tabular-nums">
                    {formatARS(decimalToCents(c.amount))}
                  </TableCell>
                  <TableCell className="w-40 text-right">
                    {puedeEmitir && <AnularCargoForm clubSlug={slug} cargoId={c.id} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Movimientos
        </h2>
        {movimientos.length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center">
            <p className="text-sm text-muted-foreground">Todavía no hay movimientos en esta cuenta.</p>
          </div>
        ) : (
          <Table>
            <TableBody>
              {movimientos.map((m) => (
                <TableRow key={m.id} className="h-11">
                  <TableCell className="w-32 whitespace-nowrap text-sm text-muted-foreground">
                    {formatFecha(m.bookedAt, club.timezone)}
                  </TableCell>
                  <TableCell className="text-sm">
                    <Badge variant="outline" className="mr-2">{SOURCE_LABELS[m.source]}</Badge>
                    <span className="font-medium">
                      {m.cargo?.concept ?? (m.pago ? DIR_LABELS[m.direction] : m.memo ?? DIR_LABELS[m.direction])}
                    </span>
                    {m.cargo?.status && (
                      <span className="ml-2 text-xs text-muted-foreground">{STATUS_LABELS[m.cargo.status]}</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                    {m.memo}
                  </TableCell>
                  <TableCell className={`w-36 text-right tabular-nums ${m.direction === 'debito' ? '' : 'text-green-700'}`}>
                    {m.direction === 'debito' ? '' : '+'}
                    {formatARS(m.amountCents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Saldo según movimientos: {formatARS(saldoCalculado)} (la vista de la base da {formatARS(cuenta.balanceCents)}).
        </p>
      </section>

      {puedeCobrar && (
        <section className="mt-8">
          <LinkDePagoForm clubSlug={slug} accountId={id} />
        </section>
      )}

      {puedeEmitir && (
        <section className="mt-8 rounded-lg border p-4">
          <h2 className="text-sm font-medium">Ajuste manual</h2>
          <p className="text-xs text-muted-foreground">
            Todo ajuste queda registrado en el ledger con su motivo. Nunca se edita un cargo: se anula y se emite otro.
          </p>
          <AjusteCuentaForm clubSlug={slug} accountId={id} />
        </section>
      )}
    </main>
  )
}
