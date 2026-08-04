import { and, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { checkPermission } from '@/lib/permissions'
import { CategoriaForm } from '@/modules/categorias/components/CategoriaForm'
import { listarCategorias } from '@/modules/categorias/queries'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'

export default async function CategoriasPage({ params }: { params: Promise<{ club: string }> }) {
  const { club: slug } = await params

  const ctx = await checkPermission('categorias.ver', { kind: 'club' }, slug)
  if (!ctx) {
    return <main className="px-4 py-6 text-muted-foreground">No tenés permiso para ver las categorías.</main>
  }
  const puedeEditar = await checkPermission('categorias.editar', { kind: 'club' }, slug)

  const [club] = await db.select().from(clubs).where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt))).limit(1)
  if (!club) return null

  const categorias = await listarCategorias(club.id)
  const porDeporte = Map.groupBy(categorias, (c) => c.sport)

  return (
    <main>
      <PageHeader
        title="Categorías"
        description={`${categorias.length} categorías en el club`}
      />

      {puedeEditar && (
        <div className="mt-6 max-w-md rounded-xl border bg-card p-4 shadow-xs">
          <h2 className="mb-3 text-sm font-semibold tracking-tight">Nueva categoría</h2>
          <CategoriaForm clubSlug={slug} />
        </div>
      )}

      {categorias.length === 0 ? (
        <EmptyState
          className="mt-8"
          title="No hay categorías todavía"
          description="Creá la primera categoría para empezar a armar el plantel."
        />
      ) : (
        [...porDeporte.entries()].map(([sport, items]) => (
          <section key={sport} className="mt-8">
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {sport}
            </h2>
            <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
              <Table>
                <TableBody>
                  {items.map((c) => (
                    <TableRow key={c.id} className="h-12">
                      <TableCell>
                        <Link href={`/${slug}/categorias/${c.id}`} className="font-medium hover:underline">
                          {c.label}
                        </Link>
                        <span className="ml-2 text-xs text-muted-foreground">temporada {c.season}</span>
                      </TableCell>
                      <TableCell className="w-28 text-right">
                        {c.isActive ? (
                          <Badge variant="outline" className="text-green-700">Activa</Badge>
                        ) : (
                          <Badge variant="outline">Inactiva</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        ))
      )}
    </main>
  )
}
