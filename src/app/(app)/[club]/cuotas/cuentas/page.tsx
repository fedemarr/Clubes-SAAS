import Link from 'next/link'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { checkPermission } from '@/lib/permissions'
import { formatARS } from '@/lib/money'
import { listarCuentasConSaldo } from '@/modules/cuotas/queries'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'

export default async function CuentasPage({ params }: { params: Promise<{ club: string }> }) {
  const { club: slug } = await params

  const ctx = await checkPermission('cuotas.ver', { kind: 'club' }, slug)
  if (!ctx) {
    return <main className="px-4 py-6 text-muted-foreground">No tenés permiso para ver cuotas.</main>
  }

  const [club] = await db
    .select()
    .from(clubs)
    .where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)))
    .limit(1)
  if (!club) return null

  const cuentas = await listarCuentasConSaldo(club.id)
  const conDeuda = cuentas.filter((c) => c.balanceCents > 0)
  const totalDeuda = conDeuda.reduce((acc, c) => acc + c.balanceCents, 0)

  return (
    <main>
      <PageHeader
        title="Cuenta corriente"
        description={`Por grupo familiar · ${cuentas.length} cuentas · ${formatARS(totalDeuda)} en deuda`}
        actions={
          <Button render={<Link href={`/${slug}/cuotas`} />} variant="ghost" size="sm">
            ← Cuotas
          </Button>
        }
      />

      {cuentas.length === 0 ? (
        <EmptyState className="mt-8" title="No hay cuentas corrientes todavía" />
      ) : (
        <Table className="mt-6">
        <TableBody>
          {cuentas.map((c) => (
            <TableRow key={c.id} className="h-11">
              <TableCell>
                <Link href={`/${slug}/cuotas/cuentas/${c.id}`} className="font-medium hover:underline">
                  {c.label ?? `${c.holderApellido}, ${c.holderNombre}`}
                </Link>
              </TableCell>
              <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                {c.holderApellido}, {c.holderNombre}
              </TableCell>
              <TableCell className="w-44 text-right">
                {c.balanceCents > 0 ? (
                  <Badge variant="destructive">{formatARS(c.balanceCents)}</Badge>
                ) : (
                  <Badge variant="outline" className="text-green-700">Al día</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      )}
    </main>
  )
}
