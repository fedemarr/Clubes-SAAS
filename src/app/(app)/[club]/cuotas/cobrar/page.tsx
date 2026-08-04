import Link from 'next/link'
import { checkPermission } from '@/lib/permissions'
import { PantallaCobrador } from '@/modules/cobranzas/components/PantallaCobrador'
import { Button } from '@/components/ui/button'

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
    <main>
      <Button render={<Link href={`/${slug}/cuotas/cobranzas`} />} variant="ghost" className="mb-2 -ml-2">
        ← Cobranzas
      </Button>
      <PantallaCobrador clubSlug={slug} />
    </main>
  )
}
