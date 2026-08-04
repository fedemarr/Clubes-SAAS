import Link from 'next/link'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { checkPermission } from '@/lib/permissions'
import { buscarCuentas, listarPersonasActivas, listarPlanesVigentes } from '@/modules/cuotas/queries'
import { MembresiaForm } from '@/modules/cuotas/components/MembresiaForm'
import { Button } from '@/components/ui/button'

export default async function NuevaMembresiaPage({ params }: { params: Promise<{ club: string }> }) {
  const { club: slug } = await params
  const puedeEmitir = await checkPermission('cuotas.emitir', { kind: 'club' }, slug)
  if (!puedeEmitir) {
    return <main className="px-4 py-6 text-muted-foreground">No tenés permiso para dar de alta membresías.</main>
  }

  const [club] = await db
    .select()
    .from(clubs)
    .where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)))
    .limit(1)
  if (!club) return null

  const [personas, cuentas, planes] = await Promise.all([
    listarPersonasActivas(club.id),
    buscarCuentas(club.id),
    listarPlanesVigentes(club.id),
  ])

  return (
    <main>
      <Button render={<Link href={`/${slug}/cuotas/membresias`} />} variant="ghost" className="mb-2 -ml-2">
        ← Volver
      </Button>
      <h1 className="text-xl font-semibold tracking-tight">Alta de membresía</h1>
      <p className="text-sm text-muted-foreground">
        La cuota se cobra contra la cuenta del grupo familiar, no contra la persona.
      </p>
      <MembresiaForm clubSlug={slug} personas={personas} cuentas={cuentas} planes={planes} />
    </main>
  )
}
