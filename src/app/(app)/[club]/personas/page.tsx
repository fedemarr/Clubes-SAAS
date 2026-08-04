import { and, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { listarCategorias } from '@/modules/categorias/queries'
import { BuscadorPersonas } from '@/modules/personas/components/BuscadorPersonas'
import { EstadoBadge } from '@/modules/personas/components/EstadoBadge'
import { buscarPersonas } from '@/modules/personas/queries'
import { busquedaSchema } from '@/modules/personas/schemas'
import { checkPermission } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default async function PersonasPage({
  params,
  searchParams,
}: {
  params: Promise<{ club: string }>
  searchParams: Promise<{ q?: string; categoria?: string; estado?: string }>
}) {
  const { club: slug } = await params
  const rawFiltros = await searchParams
  const parsedFiltros = busquedaSchema.safeParse({
    q: rawFiltros.q || undefined,
    categoria: rawFiltros.categoria || undefined,
    estado: rawFiltros.estado || undefined,
  })
  const filtros = parsedFiltros.success ? parsedFiltros.data : {}

  const ctx = await checkPermission('personas.ver', { kind: 'club' }, slug)
  if (!ctx) return <main className="px-4 py-6 text-muted-foreground">No tenés permiso para ver el padrón.</main>

  const [club] = await db.select().from(clubs).where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt))).limit(1)
  if (!club) return null

  const [personas, categorias] = await Promise.all([
    buscarPersonas(club.id, filtros),
    listarCategorias(club.id, { soloActivas: true }),
  ])

  return (
    <main>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Padrón</h1>
          <p className="text-sm text-muted-foreground">
            {personas.length} {personas.length === 1 ? 'resultado' : 'resultados'}
          </p>
        </div>
        <Button render={<Link href={`/${slug}/personas/nueva`} />}>Nueva persona</Button>
      </div>

      <div className="mt-4">
        <BuscadorPersonas categorias={categorias} valores={filtros} />
      </div>

      {personas.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm font-medium">No se encontraron personas</p>
          <p className="text-sm text-muted-foreground">Probá con otra búsqueda o cargá una nueva persona.</p>
        </div>
      ) : (
        <Table className="mt-4">
          <TableHeader>
            <TableRow className="h-9">
              <TableHead>Nombre</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead className="hidden sm:table-cell">Socio</TableHead>
              <TableHead className="hidden md:table-cell">Categoría</TableHead>
              <TableHead className="w-28">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {personas.map((p) => (
              <TableRow key={p.id} className="h-11">
                <TableCell>
                  <Link href={`/${slug}/personas/${p.id}`} className="font-medium hover:underline">
                    {p.lastName}, {p.firstName}
                  </Link>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{p.docNumber ?? '—'}</TableCell>
                <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                  {p.memberNumber ? `#${p.memberNumber}` : '—'}
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                  {p.categoria ?? '—'}
                </TableCell>
                <TableCell>
                  <EstadoBadge status={p.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  )
}
