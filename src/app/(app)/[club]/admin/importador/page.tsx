import { and, eq, isNull } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { checkPermission } from '@/lib/permissions'
import { esSuperAdmin } from '@/lib/super-admin'
import { ImporterWizard } from '@/modules/importador/components/ImporterWizard'
import { listarBatches, obtenerMapeos } from '@/modules/importador/queries'
import { CAMPOS_POR_TIPO } from '@/modules/importador/schemas'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const dynamic = 'force-dynamic'

export default async function ImportadorPage({ params }: { params: Promise<{ club: string }> }) {
  const { club: slug } = await params

  const ctx = await checkPermission('importador.usar', { kind: 'club' }, slug)
  const sa = ctx ? null : await esSuperAdmin()
  if (!ctx && !sa) {
    return <main className="px-4 py-6 text-muted-foreground">No tenés permiso para usar el importador.</main>
  }

  const [club] = await db.select().from(clubs).where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt))).limit(1)
  if (!club) notFound()

  const [mapeos, batches] = await Promise.all([obtenerMapeos(club.id), listarBatches(club.id)])

  return (
    <main>
      <PageHeader
        title="Importador"
        description="Cargá el padrón o las categorías desde una planilla, mapeando las columnas una sola vez."
      />

      {sa && (
        <p className="mt-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2 text-xs text-muted-foreground">
          Modo super admin: estás operando el importador del club <span className="font-semibold">{club.name}</span>.
        </p>
      )}

      <ImporterWizard clubSlug={slug} mapeos={mapeos} />

      <section className="mt-10">
        <h2 className="text-sm font-semibold">Historial de importaciones</h2>
        {batches.length === 0 ? (
          <EmptyState
            className="mt-3"
            title="Todavía no se importó nada"
            description="Cuando importes, cada corrida queda registrada acá con su detalle."
          />
        ) : (
          <div className="mt-3 overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Archivo</TableHead>
                  <TableHead className="text-right">Filas</TableHead>
                  <TableHead className="text-right">Importadas</TableHead>
                  <TableHead className="text-right">Duplicadas</TableHead>
                  <TableHead className="text-right">Errores</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {b.created_at.toLocaleString('es-AR')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {b.import_type === 'personas' ? CAMPOS_POR_TIPO.personas.label : CAMPOS_POR_TIPO.categorias.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{b.file_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.total_rows}</TableCell>
                    <TableCell className="text-right tabular-nums text-green-700">{b.imported_rows}</TableCell>
                    <TableCell className="text-right tabular-nums text-amber-600">{b.skipped_rows}</TableCell>
                    <TableCell className="text-right tabular-nums text-red-600">{b.error_rows}</TableCell>
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