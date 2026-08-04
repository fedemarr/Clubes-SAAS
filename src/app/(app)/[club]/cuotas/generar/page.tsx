import Link from 'next/link'
import { checkPermission } from '@/lib/permissions'
import { GeneracionForm } from '@/modules/cuotas/components/GeneracionForm'
import { Button } from '@/components/ui/button'

export default async function GenerarCargosPage({ params }: { params: Promise<{ club: string }> }) {
  const { club: slug } = await params
  const puedeEmitir = await checkPermission('cuotas.emitir', { kind: 'club' }, slug)
  if (!puedeEmitir) {
    return <main className="px-4 py-6 text-muted-foreground">No tenés permiso para generar cargos.</main>
  }

  return (
    <main>
      <Button render={<Link href={`/${slug}/cuotas`} />} variant="ghost" className="mb-2 -ml-2">
        ← Volver
      </Button>
      <h1 className="text-xl font-semibold tracking-tight">Generación mensual de cuotas</h1>
      <p className="text-sm text-muted-foreground">
        Previsualizá el mes completo antes de confirmar. Es idempotente: correrlo dos veces no duplica cargos.
      </p>
      <GeneracionForm clubSlug={slug} />
    </main>
  )
}
