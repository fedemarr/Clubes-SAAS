import Link from 'next/link'
import { checkPermission } from '@/lib/permissions'
import { AjusteForm } from '@/modules/cuotas/components/AjusteForm'
import { Button } from '@/components/ui/button'

export default async function AjustarPrecioPage({ params }: { params: Promise<{ club: string }> }) {
  const { club: slug } = await params
  const puedeEmitir = await checkPermission('cuotas.emitir', { kind: 'club' }, slug)
  if (!puedeEmitir) {
    return <main className="px-4 py-6 text-muted-foreground">No tenés permiso para ajustar precios.</main>
  }

  return (
    <main>
      <Button render={<Link href={`/${slug}/cuotas`} />} variant="ghost" className="mb-2 -ml-2">
        ← Volver
      </Button>
      <h1 className="text-xl font-semibold tracking-tight">Ajuste masivo de precios</h1>
      <p className="text-sm text-muted-foreground">
        Cierra la versión vigente del deporte y crea una nueva con el precio actualizado.
      </p>
      <AjusteForm clubSlug={slug} />
    </main>
  )
}
