import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { listarAuditoriaSuperAdmin } from '@/modules/super-admin/queries'
import { DescargarAuditoriaCsvButton } from '@/modules/super-admin/components/descargar-auditoria-button'

export const dynamic = 'force-dynamic'

export default async function SuperAdminAuditoriaPage() {
  const registros = await listarAuditoriaSuperAdmin({ limit: 100 })

  return (
    <main>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Auditoría de super admin"
          description="Todas las acciones administrativas de la plataforma."
        />
        <DescargarAuditoriaCsvButton />
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Cuándo</th>
              <th className="px-4 py-2.5 font-medium">Actor</th>
              <th className="px-4 py-2.5 font-medium">Acción</th>
              <th className="px-4 py-2.5 font-medium">Entidad</th>
              <th className="px-4 py-2.5 font-medium">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {registros.length > 0 ? (
              registros.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0">
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {r.at.toLocaleString('es-AR')}
                  </td>
                  <td className="px-4 py-3">{r.actorEmail}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{r.action}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {r.entity}
                    {r.entityId ? <span className="ml-1 text-muted-foreground">({r.entityId.slice(0, 8)})</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    {r.diff ? (
                      <pre className="max-w-64 truncate font-mono text-[11px] text-muted-foreground">
                        {JSON.stringify(r.diff)}
                      </pre>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  Sin acciones registradas todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  )
}