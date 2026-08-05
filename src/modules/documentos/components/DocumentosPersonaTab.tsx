import { Download } from 'lucide-react'
import { listarDocumentos, tiposHabilitados } from '../queries'
import { subirDocumentoStaff } from '../actions'
import { EstadoDocumentoBadge } from './EstadoDocumentoBadge'
import { RevisarDocumentoButtons } from './RevisarDocumentoButtons'
import { SubirDocumentoForm } from './SubirDocumentoForm'

export async function DocumentosPersonaTab({
  clubId,
  clubSlug,
  personId,
  personNombre,
  puedeGestionar,
}: {
  clubId: string
  clubSlug: string
  personId: string
  personNombre: string
  puedeGestionar: boolean
}) {
  const [docs, tipos] = await Promise.all([
    listarDocumentos(clubId, { personIds: [personId] }),
    tiposHabilitados(clubId),
  ])

  return (
    <section className="space-y-6">
      {docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin documentos cargados.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-xs">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{d.tipoLabel ?? d.kind}</p>
                  <EstadoDocumentoBadge status={d.status} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {d.fileName ?? '—'}
                  {d.issuedOn ? ` · emitido ${d.issuedOn}` : ''}
                  {d.expiresOn ? ` · vence ${d.expiresOn}` : ''}
                  {d.rejectionReason ? ` · ${d.rejectionReason}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
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
                {puedeGestionar && d.status === 'pendiente' && (
                  <RevisarDocumentoButtons clubSlug={clubSlug} documentId={d.id} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {puedeGestionar && (
        <SubirDocumentoForm
          clubSlug={clubSlug}
          personas={[{ id: personId, label: personNombre }]}
          tipos={tipos.map((t) => ({ kind: t.kind, label: t.label, requiresExpiry: t.requiresExpiry }))}
          showPersona={false}
          action={subirDocumentoStaff}
          label="Subir documento"
        />
      )}
    </section>
  )
}
