import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { checkPermission } from '@/lib/permissions'
import { decimalToCents } from '@/lib/money'
import { cuentasDebitables, cuentasSinCbuParaDebito, listarLotesDebito } from '@/modules/cobranzas/queries'
import { DebitoPanel } from '@/modules/cobranzas/components/DebitoPanel'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/page-header'

export default async function DebitoPage({
  params,
}: {
  params: Promise<{ club: string }>
}) {
  const { club: slug } = await params

  const ctx = await checkPermission('cobranzas.registrar', { kind: 'club' }, slug)
  if (!ctx) {
    return (
      <main className="px-4 py-6 text-muted-foreground">
        No tenés permiso para gestionar débitos. Esta acción es del tesorero.
      </main>
    )
  }

  const [sinCbu, candidatas, lotes] = await Promise.all([
    cuentasSinCbuParaDebito(ctx.clubId),
    cuentasDebitables(ctx.clubId),
    listarLotesDebito(ctx.clubId),
  ])

  return (
    <main>
      <PageHeader
        title="Débito automático"
        description="Generá el lote con las cuentas que tienen CBU y saldo deudor, bajá el CSV para el banco y acreditá cuando el banco confirme. Los rechazos se importan y se revierten con asiento inverso."
        actions={
          <Button render={<Link href={`/${slug}/cuotas/cobranzas`} />} variant="ghost" size="sm">
            <ArrowLeft data-icon="inline-start" />
            Cobranzas
          </Button>
        }
      />

      <DebitoPanel
        clubSlug={slug}
        sinCbu={sinCbu}
        candidatas={candidatas}
        lotes={lotes.map((l) => ({ ...l, montoTotalCents: decimalToCents(l.montoTotal), createdAt: l.createdAt.toISOString() }))}
      />
    </main>
  )
}
