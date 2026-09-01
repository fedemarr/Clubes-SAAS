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
        [...porDeporte.entries()].map(([sport, items], idx) => (
          <section key={sport} className={idx === 0 ? 'mt-8' : 'mt-10'}>
            <div className="mb-3 flex items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold capitalize text-primary">
                {sport[0]?.toUpperCase()}
              </span>
              <h2 className="text-sm font-semibold capitalize tracking-tight">{sport}</h2>
              <span className="text-xs text-muted-foreground">{items.length} categorías</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((c) => (
                <Link
                  key={c.id}
                  href={`/${slug}/categorias/${c.id}`}
                  className="group flex items-center justify-between gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Temporada {c.season}</p>
                    {c.birthYearFrom != null && c.birthYearTo != null && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                        {c.birthYearFrom}–{c.birthYearTo}
                      </p>
                    )}
                  </div>
                  {c.isActive ? (
                    <Badge variant="outline" className="shrink-0 text-green-700">Activa</Badge>
                  ) : (
                    <Badge variant="outline" className="shrink-0">Inactiva</Badge>
                  )}
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </main>
  )
}
