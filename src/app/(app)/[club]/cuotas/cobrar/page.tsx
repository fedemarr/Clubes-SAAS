import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { checkPermission } from '@/lib/permissions'
import { PantallaCobrador } from '@/modules/cobranzas/components/PantallaCobrador'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'

export default async function CobrarPage({
  params,
}: {
  params: Promise<{ club: string }>
}) {
  const { club: slug } = await params

  const ctx = await checkPermission('cobranzas.registrar', { kind: 'club' }, slug)
  if (!ctx) {
    return (
      <main className="px-4 py-6 text-muted-foreground">
        No tenés permiso para registrar cobros. Esta acción es del tesorero.
      </main>
    )
  }

  return (
    <main className="pb-24 lg:pb-8">
      <PageHeader
        title="Cobrar"
        description="Buscá la familia, registrá el pago y mandá el recibo."
        actions={
          <Button render={<Link href={`/${slug}/cuotas/cobranzas`} />} variant="ghost" size="sm">
            <ArrowLeft data-icon="inline-start" />
            Cobranzas
          </Button>
        }
      />
      <div className="mt-6">
        <PantallaCobrador clubSlug={slug} />
      </div>
    </main>
  )
}
