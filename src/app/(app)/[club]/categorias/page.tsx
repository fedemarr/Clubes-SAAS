import { and, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { checkPermission } from '@/lib/permissions'
import { CategoriaForm } from '@/modules/categorias/components/CategoriaForm'
import { listarCategorias } from '@/modules/categorias/queries'

export default async function CategoriasPage({ params }: { params: Promise<{ club: string }> }) {
  const { club: slug } = await params

  const ctx = await checkPermission('categorias.ver', { kind: 'club' }, slug)
  if (!ctx) return <main style={{ padding: '1rem' }}>No tenés permiso para ver las categorías.</main>
  const puedeEditar = await checkPermission('categorias.editar', { kind: 'club' }, slug)

  const [club] = await db.select().from(clubs).where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt))).limit(1)
  if (!club) return null

  const categorias = await listarCategorias(club.id)
  const porDeporte = Map.groupBy(categorias, (c) => c.sport)

  return (
    <main style={{ padding: '1rem' }}>
      <h1>Categorías</h1>
      {puedeEditar && <CategoriaForm clubSlug={slug} />}

      {[...porDeporte.entries()].map(([sport, items]) => (
        <section key={sport} style={{ marginTop: '1.5rem' }}>
          <h2 style={{ textTransform: 'capitalize' }}>{sport}</h2>
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.4rem' }}>
            {items.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/${slug}/categorias/${c.id}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '0.6rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    color: 'inherit',
                    textDecoration: 'none',
                  }}
                >
                  <span>
                    {c.label} · temporada {c.season}
                  </span>
                  <span>{c.isActive ? 'activa' : 'inactiva'}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  )
}
