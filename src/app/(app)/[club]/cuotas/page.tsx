import Link from 'next/link'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { checkPermission } from '@/lib/permissions'
import { decimalToCents, formatARS } from '@/lib/money'
import { listarPlanes } from '@/modules/cuotas/queries'
import { planVigente } from '@/modules/cuotas/service'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'

function formatDate(iso: string | null): string {
  if (!iso) return 'hoy'
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatoDescuentos(arr: number[] | null): string {
  if (!arr || arr.length === 0) return '—'
  return arr
    .map((d, i) => `${i === 0 ? '1º' : `${i + 1}º`} ${d}%`)
    .join(' · ')
}

export default async function CuotasPage({ params }: { params: Promise<{ club: string }> }) {
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

  const planes = await listarPlanes(club.id)
  const hoy = new Date().toISOString().slice(0, 10)

  const grupos = Map.groupBy(planes, (p) => p.sport ?? '__sin_deporte__')

  return (
    <main>
      <PageHeader
        title="Cuotas"
        description="Planes de cuota por deporte, con historial de precios"
        actions={
          puedeEmitir && (
            <>
              <Button render={<Link href={`/${slug}/cuotas/generar`} />}>Generar cuotas</Button>
              <Button render={<Link href={`/${slug}/cuotas/cuentas`} />} variant="outline">
                Cuenta corriente
              </Button>
              <Button render={<Link href={`/${slug}/cuotas/membresias`} />} variant="outline">
                Membresías
              </Button>
              <Button render={<Link href={`/${slug}/cuotas/ajustar`} />} variant="outline">
                Ajustar precios
              </Button>
              <Button render={<Link href={`/${slug}/cuotas/nuevo`} />} variant="outline">
                Nuevo plan
              </Button>
            </>
          )
        }
      />

      {planes.length === 0 && (
        <EmptyState
          className="mt-8"
          title="No hay planes de cuota todavía"
          description={puedeEmitir ? 'Creá el primer plan de cuota.' : undefined}
        />
      )}

      {[...grupos.entries()].map(([sport, versions]) => {
        const vigente = planVigente(versions, hoy)
        const orden = [...versions].sort((a, b) => a.validFrom.localeCompare(b.validFrom))
        return (
          <section key={sport} className="mt-6">
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {sport === '__sin_deporte__' ? 'Cuota social' : sport}
            </h2>
            <Table>
              <TableBody>
                {orden.map((p) => {
                  const esVigente = vigente?.id === p.id
                  return (
                    <TableRow key={p.id} className="h-11">
                      <TableCell className="w-64">
                        <span className="font-medium">{p.name}</span>
                      </TableCell>
                      <TableCell className="w-40 text-sm">
                        {esVigente && <Badge>Vigente</Badge>}
                      </TableCell>
                      <TableCell className="w-44 text-sm tabular-nums">
                        {formatARS(decimalToCents(p.amount))}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                        desde {formatDate(p.validFrom)}
                        {p.validTo && ` · hasta ${formatDate(p.validTo)}`}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                        {formatoDescuentos(p.siblingDiscounts)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </section>
        )
      })}
    </main>
  )
}
