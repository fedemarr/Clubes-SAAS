import { Gift } from 'lucide-react'
import { redirect } from 'next/navigation'
import { rolesEnClub, checkPermission } from '@/lib/permissions'
import { listarBeneficios } from '@/modules/beneficios/queries'
import { BeneficiosAdmin } from '@/modules/beneficios/components/BeneficiosAdmin'

export const dynamic = 'force-dynamic'

export default async function BeneficiosPage({ params }: { params: Promise<{ club: string }> }) {
  const { club: slug } = await params

  const ctx = await rolesEnClub(slug)
  if (!ctx) redirect('/')

  const permission = await checkPermission('beneficios.gestionar', { kind: 'club' }, slug)
  if (!permission) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center">
        <Gift className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">No tenés permiso para gestionar beneficios.</p>
      </div>
    )
  }

  const beneficios = await listarBeneficios(ctx.clubId, false)

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Gift className="size-6 text-primary" />
          Beneficios para socios
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Se muestran en el home del portal. Los ve cualquier socio conectado al club.
        </p>
      </div>
      <BeneficiosAdmin clubSlug={slug} beneficios={beneficios} />
    </div>
  )
}