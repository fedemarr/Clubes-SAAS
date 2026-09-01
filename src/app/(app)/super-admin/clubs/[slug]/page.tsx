import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, Upload } from 'lucide-react'
import { formatARS } from '@/lib/money'
import { esSuperAdmin } from '@/lib/super-admin'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs } from '@/components/ui/tabs'
import {
  obtenerClubParaEdicion,
  planesDelClub,
  categoriasDelClub,
  staffDelClub,
  auditoriaDelClub,
} from '@/modules/super-admin/queries'
import { EditarClubForm } from '@/modules/super-admin/components/editar-club-form'
import { SuspenderClubButton } from '@/modules/super-admin/components/suspender-club-button'

export const dynamic = 'force-dynamic'

const ROLES_STAFF_ORDER = ['presidente', 'secretaria', 'tesorero', 'coordinador', 'entrenador', 'manager']

export default async function SuperAdminClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!(await esSuperAdmin())) redirect('/')

  const club = await obtenerClubParaEdicion(slug)
  if (!club) notFound()

  const [planes, categorias, staff, auditoria] = await Promise.all([
    planesDelClub(club.id),
    categoriasDelClub(club.id),
    staffDelClub(club.id),
    auditoriaDelClub(club.id, 80),
  ])

  return (
    <main>
      <Link
        href="/super-admin"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Volver a clubs
      </Link>

      <PageHeader
        title={club.name}
        description={`/${club.slug} · ${club.locality ?? 'Sin localidad'} · ${club.timezone}`}
        actions={
          <div className="flex items-center gap-2">
            <Button render={<Link href={`/${club.slug}/admin/importador`} />} variant="outline" size="sm">
              <Upload data-icon="inline-start" />
              Importar datos
            </Button>
            {club.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={club.logoUrl} alt="" width={36} height={36} className="rounded-full ring-1 ring-foreground/10" />
            )}
            {club.deletedAt ? (
              <Badge variant="destructive">Suspendido</Badge>
            ) : (
              <Badge variant="outline">Activo</Badge>
            )}
            <SuspenderClubButton slug={club.slug} suspendido={Boolean(club.deletedAt)} />
          </div>
        }
      />

      <Tabs
        defaultValue="general"
        items={[
          { value: 'general', label: 'General', content: <EditarClubForm club={club} /> },
          {
            value: 'planes',
            label: 'Planes de cuota',
            content: (
              <div className="overflow-hidden rounded-xl border bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Nombre</th>
                      <th className="px-4 py-2.5 font-medium">Deporte</th>
                      <th className="px-4 py-2.5 font-medium">Monto</th>
                      <th className="px-4 py-2.5 font-medium">Vigencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planes.length > 0 ? (
                      planes.map((p) => (
                        <tr key={p.id} className="border-b last:border-b-0">
                          <td className="px-4 py-3 font-medium">{p.name}</td>
                          <td className="px-4 py-3 text-muted-foreground">{p.sport ?? '—'}</td>
                          <td className="px-4 py-3 tabular-nums">{formatARS(p.amountCents)}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {p.valid_from} → {p.valid_to ?? 'vigente'}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                          Sin planes cargados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ),
          },
          {
            value: 'categorias',
            label: 'Categorías',
            content: (
              <div className="overflow-hidden rounded-xl border bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Deporte</th>
                      <th className="px-4 py-2.5 font-medium">Etiqueta</th>
                      <th className="px-4 py-2.5 font-medium">Temp.</th>
                      <th className="px-4 py-2.5 font-medium">Años</th>
                      <th className="px-4 py-2.5 font-medium">Jugadores</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categorias.length > 0 ? (
                      categorias.map((c) => (
                        <tr key={c.id} className="border-b last:border-b-0">
                          <td className="px-4 py-3 capitalize">{c.sport}</td>
                          <td className="px-4 py-3 font-medium">{c.label}</td>
                          <td className="px-4 py-3 tabular-nums">{c.season}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {c.birth_year_from ?? '—'} → {c.birth_year_to ?? '—'}
                          </td>
                          <td className="px-4 py-3 tabular-nums">{c.jugadores}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                          Sin categorías cargadas.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ),
          },
          {
            value: 'staff',
            label: 'Staff',
            content: (
              <div className="overflow-hidden rounded-xl border bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Rol</th>
                      <th className="px-4 py-2.5 font-medium">Persona</th>
                      <th className="px-4 py-2.5 font-medium">Email</th>
                      <th className="px-4 py-2.5 font-medium">Vigencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.length > 0 ? (
                      [...staff].sort(
                        (a, b) =>
                          ROLES_STAFF_ORDER.indexOf(a.role) - ROLES_STAFF_ORDER.indexOf(b.role),
                      ).map((s, i) => (
                        <tr key={i} className="border-b last:border-b-0">
                          <td className="px-4 py-3">
                            <Badge variant="secondary">{s.role}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            {s.first_name} {s.last_name}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {s.user_email ?? s.email ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {s.valid_from} → {s.valid_to ?? 'vigente'}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                          Sin staff cargado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ),
          },
          {
            value: 'auditoria',
            label: 'Auditoría',
            content: (
              <div className="overflow-hidden rounded-xl border bg-card">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Entidad</th>
                      <th className="px-4 py-2.5 font-medium">Acción</th>
                      <th className="px-4 py-2.5 font-medium">Diff</th>
                      <th className="px-4 py-2.5 font-medium">Cuándo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditoria.length > 0 ? (
                      auditoria.map((a) => (
                        <tr key={a.id} className="border-b last:border-b-0">
                          <td className="px-4 py-3 font-mono text-xs">{a.entity}</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline">{a.action}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            {a.diff ? (
                              <pre className="max-w-56 truncate font-mono text-[11px] text-muted-foreground">
                                {JSON.stringify(a.diff)}
                              </pre>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {a.at.toLocaleString('es-AR')}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                          Sin actividad registrada.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ),
          },
        ]}
      />
    </main>
  )
}