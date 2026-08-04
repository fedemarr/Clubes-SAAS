import Link from 'next/link'
import { checkPermission } from '@/lib/permissions'
import { decimalToCents } from '@/lib/money'
import { buscarCuentaParaCobrar, listarPagosPendientes } from '@/modules/cobranzas/queries'
import { ConciliadorForm } from '@/modules/cobranzas/components/ConciliadorForm'
import { Button } from '@/components/ui/button'

export default async function ConciliarPage({
  params,
}: {
  params: Promise<{ club: string }>
}) {
  const { club: slug } = await params

  const ctx = await checkPermission('cobranzas.conciliar', { kind: 'club' }, slug)
  if (!ctx) {
    return (
      <main className="px-4 py-6 text-muted-foreground">
        No tenés permiso para conciliar pagos. Esta acción es del tesorero.
      </main>
    )
  }

  const [pendientes, deudoras] = await Promise.all([
    listarPagosPendientes(ctx.clubId),
    buscarCuentaParaCobrar(ctx.clubId, ''),
  ])

  return (
    <main>
      <Button render={<Link href={`/${slug}/cuotas/cobranzas`} />} variant="ghost" className="mb-2 -ml-2">
        ← Cobranzas
      </Button>
      <h1 className="text-xl font-semibold tracking-tight">Conciliación de transferencias</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Subí el extracto del banco y el sistema propone los matcheos por monto exacto y nombre del ordenante.
        Confirmás con un clic y se acredita contra los cargos abiertos.
      </p>

      <ConciliadorForm
        clubSlug={slug}
        deudores={deudoras.map((d) => ({ accountId: d.id, label: `${d.holderApellido}, ${d.holderNombre}` }))}
        pendientes={pendientes.map((p) => ({ ...p, montoCents: decimalToCents(p.amount) }))}
      />
    </main>
  )
}
