import { and, eq, isNull } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { checkPermission } from '@/lib/permissions'
import { AsignarPersonaForm } from '@/modules/categorias/components/AsignarPersonaForm'
import { PlantelTable } from '@/modules/categorias/components/PlantelTable'
import { obtenerCategoria, obtenerPlantel } from '@/modules/categorias/queries'

export default async function CategoriaDetallePage({ params }: { params: Promise<{ club: string; id: string }> }) {
  const { club: slug, id } = await params

  const ctx = await checkPermission('categorias.ver', { kind: 'club' }, slug)
  if (!ctx) return <main style={{ padding: '1rem' }}>No tenés permiso para ver esta categoría.</main>
  const puedeEditar = await checkPermission('categorias.editar', { kind: 'team', teamId: id }, slug)

  const [club] = await db.select().from(clubs).where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt))).limit(1)
  if (!club) return null

  const categoria = await obtenerCategoria(club.id, id)
  if (!categoria) notFound()

  const plantel = await obtenerPlantel(club.id, id)

  return (
    <main style={{ padding: '1rem' }}>
      <h1>
        {categoria.sport} · {categoria.label}
      </h1>
      <p>
        Temporada {categoria.season}
        {categoria.birthYearFrom && ` · nacidos ${categoria.birthYearFrom}`}
        {categoria.birthYearTo && categoria.birthYearTo !== categoria.birthYearFrom && `-${categoria.birthYearTo}`}
      </p>

      <h2>Plantel</h2>
      {puedeEditar && <AsignarPersonaForm clubSlug={slug} teamId={id} />}
      <PlantelTable clubSlug={slug} plantel={plantel} />
    </main>
  )
}
