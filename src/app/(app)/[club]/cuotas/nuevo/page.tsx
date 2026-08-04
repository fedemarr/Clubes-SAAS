import Link from 'next/link'
import { checkPermission } from '@/lib/permissions'
import { PlanForm } from '@/modules/cuotas/components/PlanForm'
import { Button } from '@/components/ui/button'

export default async function NuevoPlanPage({ params }: { params: Promise<{ club: string }> }) {
  const { club: slug } = await params
  const puedeEmitir = await checkPermission('cuotas.emitir', { kind: 'club' }, slug)
  if (!puedeEmitir) {
    return <main className="px-4 py-6 text-muted-foreground">No tenés permiso para crear planes.</main>
  }

  return (
    <main>
      <Button render={<Link href={`/${slug}/cuotas`} />} variant="ghost" className="mb-2 -ml-2">
        ← Volver
      </Button>
      <h1 className="text-xl font-semibold tracking-tight">Nuevo plan de cuota</h1>
      <p className="text-sm text-muted-foreground">
        Cada plan tiene vigencia desde/hasta; cambiar un precio genera una versión nueva, nunca pisa la anterior.
      </p>
      <PlanForm clubSlug={slug} />
    </main>
  )
}
