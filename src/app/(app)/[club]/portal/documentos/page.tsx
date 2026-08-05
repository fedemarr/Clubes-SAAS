import { and, eq, isNull } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { FileText } from 'lucide-react'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { rolesEnClub } from '@/lib/permissions'
import { grupoFamiliar, misDocumentos } from '@/modules/portal/queries'
import { iniciarSubidaDocumento } from '@/modules/portal/actions'
import { tiposHabilitados } from '@/modules/documentos/queries'
import { EstadoDocumentoBadge } from '@/modules/documentos/components/EstadoDocumentoBadge'
import { SubirDocumentoForm } from '@/modules/documentos/components/SubirDocumentoForm'
import { BorrarDocumentoButton } from '@/modules/portal/components/BorrarDocumentoButton'
import { EmptyState } from '@/components/empty-state'
import { Download } from 'lucide-react'

export const dynamic = 'force-dynamic'

const SECCIONES = [
  { id: 'pendiente', titulo: 'Pendientes', hint: 'En revisión del club.' },
  { id: 'vigente', titulo: 'Vigentes', hint: 'Al día.' },
  { id: 'vencido', titulo: 'Vencidos', hint: 'Renová antes de que sea tarde.' },
  { id: 'rechazado', titulo: 'Rechazados', hint: 'Corregí y volvé a subir.' },
] as const

export default async function PortalDocumentosPage({ params }: { params: Promise<{ club: string }> }) {
  const { club: slug } = await params

  const ctx = await rolesEnClub(slug)
  if (!ctx) redirect('/')

  const [club] = await db
    .select()
    .from(clubs)
    .where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)))
    .limit(1)
  if (!club) redirect('/')

  const [docs, tipos, grupo] = await Promise.all([
    misDocumentos(ctx.clubId, ctx.personId),
    tiposHabilitados(ctx.clubId),
    grupoFamiliar(ctx.clubId, ctx.personId),
  ])

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <FileText className="size-6 text-primary" />
          Documentos
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Aptos, seguros y autorizaciones de tu grupo familiar. Subí un archivo y el club lo revisa.
        </p>
      </div>

      {docs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Sin documentos"
          description="Cuando subas un apto o una autorización, la vas a ver acá."
        />
      ) : (
        SECCIONES.map((s) => {
          const items = docs.filter((d) => d.status === s.id)
          if (items.length === 0) return null
          return (
            <section key={s.id}>
              <div className="flex items-baseline gap-2">
                <h2 className="text-sm font-semibold tracking-tight">{s.titulo}</h2>
                <span className="text-xs text-muted-foreground">
                  {items.length} · {s.hint}
                </span>
              </div>
              <ul className="mt-3 divide-y rounded-xl border bg-card shadow-sm">
                {items.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{d.tipoLabel ?? d.kind}</p>
                        <EstadoDocumentoBadge status={d.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {d.personNombre}
                        {d.fileName ? ` · ${d.fileName}` : ''}
                        {d.expiresOn ? ` · vence ${d.expiresOn}` : ''}
                        {d.rejectionReason ? ` · ${d.rejectionReason}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {d.downloadUrl && (
                        <a
                          href={d.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          <Download className="size-3.5" />
                          Ver
                        </a>
                      )}
                      {(d.status === 'pendiente' || d.status === 'rechazado') && (
                        <BorrarDocumentoButton clubSlug={slug} documentId={d.id} />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )
        })
      )}

      {tipos.length > 0 && grupo.length > 0 && (
        <SubirDocumentoForm
          clubSlug={slug}
          personas={grupo.map((g) => ({ id: g.id, label: g.nombre }))}
          tipos={tipos.map((t) => ({ kind: t.kind, label: t.label, requiresExpiry: t.requiresExpiry }))}
          showPersona={grupo.length > 1}
          action={iniciarSubidaDocumento}
          label="Subir documento"
        />
      )}
    </div>
  )
}
