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
  if (!ctx) return <main style={{ padding: '1rem' }}>No tenés permiso para ver el padrón.</main>

  const [club] = await db.select().from(clubs).where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt))).limit(1)
  if (!club) return null

  const [personas, categorias] = await Promise.all([
    buscarPersonas(club.id, filtros),
    listarCategorias(club.id, { soloActivas: true }),
  ])

  return (
    <main style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h1>Padrón</h1>
        <Link href={`/${slug}/personas/nueva`}>+ Nueva persona</Link>
      </div>

      <BuscadorPersonas categorias={categorias} valores={filtros} />

      <p>{personas.length} resultado(s)</p>

      <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.5rem' }}>
        {personas.map((p) => (
          <li key={p.id}>
            <Link
              href={`/${slug}/personas/${p.id}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                color: 'inherit',
                textDecoration: 'none',
              }}
            >
              <span>
                <strong>
                  {p.lastName}, {p.firstName}
                </strong>
                <br />
                <small>
                  {p.docNumber ?? 'sin documento'} {p.memberNumber ? `· socio #${p.memberNumber}` : ''}{' '}
                  {p.categoria ? `· ${p.categoria}` : ''}
                </small>
              </span>
              <EstadoBadge status={p.status} />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
