import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, eq, isNull } from 'drizzle-orm'
import { ArrowLeft } from 'lucide-react'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { checkPermission } from '@/lib/permissions'
import { listarTiposDocumento } from '@/modules/documentos/queries'
import { TiposDocumentoForm } from '@/modules/documentos/components/TiposDocumentoForm'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'

export default async function TiposDocumentoPage({ params }: { params: Promise<{ club: string }> }) {
  const { club: slug } = await params

  const ctx = await checkPermission('documentos.tipos', { kind: 'club' }, slug)
  if (!ctx) {
    return <main className="px-4 py-6 text-muted-foreground">No tenés permiso para configurar los tipos.</main>
  }

  const [club] = await db
    .select()
    .from(clubs)
    .where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)))
    .limit(1)
  if (!club) notFound()

  const tipos = await listarTiposDocumento(ctx.clubId)

  return (
    <main>
      <PageHeader
        title="Tipos de documento"
        description="Qué documentos exige el club, si vencen y con cuántos días de antelación avisar."
        actions={
          <Button render={<Link href={`/${slug}/documentos`} />} variant="outline" size="sm">
            <ArrowLeft data-icon="inline-start" />
            Documentos
          </Button>
        }
      />
      <div className="mt-6">
        <TiposDocumentoForm clubSlug={slug} tipos={tipos} />
      </div>
    </main>
  )
}
