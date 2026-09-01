import Link from 'next/link'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { checkPermission } from '@/lib/permissions'
import { decimalToCents, formatARS } from '@/lib/money'
import { listarMembresias } from '@/modules/cuotas/queries'
import { CuotasNav } from '@/modules/cuotas/components/CuotasNav'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'

const STATUS_LABELS: Record<string, string> = {
  activa: 'Activa',
  baja: 'Baja',
  suspendida: 'Suspendida',
}

export default async function MembresiasPage({ params }: { params: Promise<{ club: string }> }) {
  const { club: slug } = await params

  const ctx = await checkPermission('cuotas.ver', { kind: 'club' }, slug)
  if (!ctx) {
    return <main className="px-4 py-6 text-muted-foreground">No tenés permiso para ver cuotas.</main>
  }

  const puedeEmitir = await checkPermission('cuotas.emitir', { kind: 'club' }, slug)

  const [club] = await db
    .select()
    .from(clubs)
    .where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)))
    .limit(1)
  if (!club) return null

  const membresias = await listarMembresias(club.id)

  return (
    <main>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Membresías</h1>
          <p className="text-sm text-muted-foreground">Qué persona paga qué plan, contra qué cuenta</p>
        </div>
        {puedeEmitir && (
          <Button render={<Link href={`/${slug}/cuotas/membresias/nueva`} />}>Alta de membresía</Button>
        )}
      </div>

      <div className="mt-4">
        <CuotasNav clubSlug={slug} />
      </div>

      {membresias.length === 0 && (
        <div className="mt-8 flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm font-medium">No hay membresías cargadas</p>
          {puedeEmitir && (
            <p className="text-sm text-muted-foreground">Dale de alta la primera desde este botón.</p>
          )}
        </div>
      )}

      <Table className="mt-6">
        <TableBody>
          {membresias.map((m) => (
            <TableRow key={m.id} className="h-11">
              <TableCell className="w-56">
                <span className="font-medium">{m.personaApellido}, {m.personaNombre}</span>
              </TableCell>
              <TableCell className="w-52 text-sm">
                {m.planNombre}
                {m.planSport && <span className="text-muted-foreground"> · {m.planSport}</span>}
              </TableCell>
              <TableCell className="w-36 text-sm tabular-nums">
                {formatARS(decimalToCents(m.planAmount))}
              </TableCell>
              <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                {m.cuentaLabel ?? 'Cuenta'}
              </TableCell>
              <TableCell className="w-28">
                <Badge variant={m.status === 'activa' ? 'default' : 'outline'}>
                  {STATUS_LABELS[m.status] ?? m.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </main>
  )
}
