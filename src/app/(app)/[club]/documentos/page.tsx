import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, eq, isNull } from 'drizzle-orm'
import { Download, Settings2 } from 'lucide-react'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { checkPermission } from '@/lib/permissions'
import { listarDocumentos, resumenDocumentos } from '@/modules/documentos/queries'
import { EstadoDocumentoBadge } from '@/modules/documentos/components/EstadoDocumentoBadge'
import { RevisarDocumentoButtons } from '@/modules/documentos/components/RevisarDocumentoButtons'
import { RecordarDocumentoButton } from '@/modules/documentos/components/RecordarDocumentoButton'
import { PageHeader } from '@/components/page-header'
import { StatCard } from '@/components/stat-card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

const FILTROS = [
  { id: 'todos', label: 'Todos' },
  { id: 'pendiente', label: 'Pendientes' },
  { id: 'vigente', label: 'Vigentes' },
  { id: 'vencido', label: 'Vencidos' },
  { id: 'rechazado', label: 'Rechazados' },
] as const

export default async function DocumentosPage({
  params,
  searchParams,
}: {
  params: Promise<{ club: string }>
  searchParams: Promise<{ estado?: string }>
}) {
  const { club: slug } = await params
  const { estado } = await searchParams

  const ctx = await checkPermission('documentos.ver', { kind: 'club' }, slug)
  if (!ctx) {
    return <main className="px-4 py-6 text-muted-foreground">No tenés permiso para ver los documentos.</main>
  }

  const [club] = await db
    .select()
    .from(clubs)
    .where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)))
    .limit(1)
  if (!club) notFound()

  const puedeGestionar = Boolean(await checkPermission('documentos.gestionar', { kind: 'club' }, slug))
  const puedeTipos = Boolean(await checkPermission('documentos.tipos', { kind: 'club' }, slug))

  const filtro = FILTROS.some((f) => f.id === estado) ? (estado as string) : 'todos'
  const [resumen, docs] = await Promise.all([
    resumenDocumentos(ctx.clubId),
    listarDocumentos(ctx.clubId, { status: filtro === 'todos' ? undefined : filtro }),
  ])

  return (
    <main>
      <PageHeader
        title="Documentos"
        description="Aptos, seguros y fichas del padrón, con control de vencimientos."
        actions={
          puedeTipos ? (
            <Button render={<Link href={`/${slug}/documentos/tipos`} />} variant="outline" size="sm">
              <Settings2 data-icon="inline-start" />
              Tipos de documento
            </Button>
          ) : undefined
        }
      />

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Pendientes" value={resumen.pendientes} />
        <StatCard label="Vigentes" value={resumen.vigentes} />
        <StatCard label="Vencidos" value={resumen.vencidos} accent="danger" />
        <StatCard label="Rechazados" value={resumen.rechazados} />
      </section>

      <div className="mt-6 flex gap-1 overflow-x-auto border-b">
        {FILTROS.map((f) => (
          <Link
            key={f.id}
            href={f.id === 'todos' ? `/${slug}/documentos` : `/${slug}/documentos?estado=${f.id}`}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              filtro === f.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <section className="mt-4">
        {docs.length === 0 ? (
          <EmptyState
            className="py-12"
            title="Sin documentos"
            description="Todavía no hay documentos en este estado."
          />
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Persona</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden sm:table-cell">Vence el</TableHead>
                  <TableHead className="hidden md:table-cell">Subido</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <Link href={`/${slug}/personas/${d.personId}?tab=documentos`} className="font-medium hover:underline">
                        {d.personNombre}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{d.tipoLabel ?? d.kind}</p>
                      {d.fileName && <p className="text-xs text-muted-foreground">{d.fileName}</p>}
                    </TableCell>
                    <TableCell>
                      <EstadoDocumentoBadge status={d.status} />
                      {d.rejectionReason && (
                        <p className="mt-1 max-w-52 text-xs text-muted-foreground">{d.rejectionReason}</p>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{d.expiresOn ?? '—'}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {d.createdAt.toLocaleDateString('es-AR')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
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
                        {(d.status === 'pendiente' || d.status === 'vencido') && (
                          <RecordarDocumentoButton clubSlug={slug} documentId={d.id} />
                        )}
                        {puedeGestionar && d.status === 'pendiente' && (
                          <RevisarDocumentoButtons clubSlug={slug} documentId={d.id} />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </main>
  )
}
