import Link from 'next/link'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { checkPermission } from '@/lib/permissions'
import { formatARS } from '@/lib/money'
import { listarCuentasConSaldo } from '@/modules/cuotas/queries'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Cuenta corriente</h1>
          <p className="text-sm text-muted-foreground">
            Por grupo familiar · {cuentas.length} cuentas ·{' '}
            <span className="font-medium text-destructive">{formatARS(totalDeuda)}</span> en deuda
          </p>
        </div>
        <Button render={<Link href={`/${slug}/cuotas`} />} variant="ghost">
          ← Cuotas
        </Button>
      </div>

      {cuentas.length === 0 && (
        <div className="mt-8 flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm font-medium">No hay cuentas corrientes todavía</p>
        </div>
      )}

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
    </main>
  )
}
