import Link from 'next/link'
import { Building2 } from 'lucide-react'
import { formatARS } from '@/lib/money'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { listarClubsConMetricas } from '@/modules/super-admin/queries'
import { NuevoClubForm } from '@/modules/super-admin/components/nuevo-club-form'
import { SuspenderClubButton } from '@/modules/super-admin/components/suspender-club-button'

export const dynamic = 'force-dynamic'

export default async function SuperAdminPage() {
  const clubs = await listarClubsConMetricas()

  return (
    <main>
      <PageHeader
        title="Clubs"
        description="Todos los tenants de la plataforma y sus métricas principales."
        actions={<NuevoClubForm />}
      />

      <div className="mt-6 overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Club</th>
              <th className="px-4 py-2.5 font-medium">Socios</th>
              <th className="px-4 py-2.5 font-medium">Deuda total</th>
              <th className="px-4 py-2.5 font-medium">Última actividad</th>
              <th className="px-4 py-2.5 font-medium">Estado</th>
              <th className="px-4 py-2.5 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {clubs.map((c) => (
              <tr key={c.id} className="border-b last:border-b-0 hover:bg-muted/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    {c.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.logoUrl} alt="" width={28} height={28} className="rounded-full ring-1 ring-foreground/10" />
                    ) : (
                      <div className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Building2 className="size-3.5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        /{c.slug} · {c.timezone}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {c.sociosActivos}
                  <span className="text-xs text-muted-foreground"> / {c.personasTotales}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-medium tabular-nums">
                    {formatARS(c.deudaTotalCents)}
                  </span>
                  <span className="text-xs text-muted-foreground"> · {c.cuentasDeudoras} ctas</span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {c.lastActivityAt
                    ? new Intl.DateTimeFormat('es-AR', {
                        timeZone: c.timezone,
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(c.lastActivityAt)
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  {c.deletedAt ? (
                    <Badge variant="destructive">Suspendido</Badge>
                  ) : (
                    <Badge variant="outline">Activo</Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      render={<Link href={`/super-admin/clubs/${c.slug}`} />}
                      variant="outline"
                      size="sm"
                    >
                      Ver
                    </Button>
                    <SuspenderClubButton slug={c.slug} suspendido={Boolean(c.deletedAt)} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}