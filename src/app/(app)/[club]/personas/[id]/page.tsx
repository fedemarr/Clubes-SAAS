import { and, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CalendarClock, FileText, Pencil } from 'lucide-react'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { checkPermission } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { listarCategorias } from '@/modules/categorias/queries'
import { EstadoBadge } from '@/modules/personas/components/EstadoBadge'
import { RolForm } from '@/modules/personas/components/RolForm'
import { VinculoForm } from '@/modules/personas/components/VinculoForm'
import { obtenerFamilia, obtenerHistorialAuditoria, obtenerPersona, obtenerRoles } from '@/modules/personas/queries'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'

const TABS = [
  { id: 'datos', label: 'Datos' },
  { id: 'familia', label: 'Familia' },
  { id: 'deportivo', label: 'Deportivo' },
  { id: 'financiero', label: 'Financiero' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'historial', label: 'Historial' },
] as const

type TabId = (typeof TABS)[number]['id']

export default async function FichaPersonaPage({
  params,
  searchParams,
}: {
  params: Promise<{ club: string; id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { club: slug, id } = await params
  const { tab } = await searchParams
  const tabActivo: TabId = TABS.some((t) => t.id === tab) ? (tab as TabId) : 'datos'

  const ctx = await checkPermission('personas.ver', { kind: 'club' }, slug)
  if (!ctx) {
    return <main className="px-4 py-6 text-muted-foreground">No tenés permiso para ver esta ficha.</main>
  }
  const puedeEditar = await checkPermission('personas.editar', { kind: 'club' }, slug)

  const [club] = await db.select().from(clubs).where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt))).limit(1)
  if (!club) return null

  const persona = await obtenerPersona(club.id, id)
  if (!persona) notFound()

  return (
    <main>
      <PageHeader
        title={`${persona.lastName}, ${persona.firstName}`}
        description={`${persona.memberNumber ? `Socio #${persona.memberNumber} · ` : ''}${persona.docType} ${persona.docNumber ?? '—'}`}
        actions={
          <div className="flex items-center gap-2">
            <EstadoBadge status={persona.status} />
            {puedeEditar && (
              <Button render={<Link href={`/${slug}/personas/${id}/editar`} />} size="sm">
                <Pencil data-icon="inline-start" />
                Editar
              </Button>
            )}
          </div>
        }
      />

      <div className="mt-6 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/${slug}/personas/${id}?tab=${t.id}`}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              t.id === tabActivo
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="mt-6 max-w-2xl">
        {tabActivo === 'datos' && (
          <dl className="grid gap-x-8 gap-y-4 rounded-xl border bg-card p-5 shadow-xs sm:grid-cols-2">
            {[
              ['Fecha de nacimiento', persona.bornOn ?? '—'],
              ['Email', persona.email ?? '—'],
              ['Teléfono', persona.phone ?? '—'],
              ['N° de socio', persona.memberNumber ? `#${persona.memberNumber}` : '—'],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs font-medium text-muted-foreground">{k}</dt>
                <dd className="mt-0.5 text-sm font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        )}

        {tabActivo === 'familia' && <FamiliaTab clubSlug={slug} personId={id} />}

        {tabActivo === 'deportivo' && <DeportivoTab clubId={club.id} clubSlug={slug} personId={id} />}

        {tabActivo === 'financiero' && (
          <EmptyState
            icon={CalendarClock}
            title="Cuenta corriente en camino"
            description="El estado de cuenta llega con el módulo de cuotas (M3)."
          />
        )}

        {tabActivo === 'documentos' && (
          <EmptyState
            icon={FileText}
            title="Documentación en camino"
            description="Aptos médicos y documentos llegan con el módulo M7."
          />
        )}

        {tabActivo === 'historial' && <HistorialTab clubId={club.id} personId={id} />}
      </div>
    </main>
  )
}

async function FamiliaTab({ clubSlug, personId }: { clubSlug: string; personId: string }) {
  const [club] = await db.select().from(clubs).where(eq(clubs.slug, clubSlug)).limit(1)
  const familia = club ? await obtenerFamilia(club.id, personId) : []

  const LABELS: Record<string, (direccion: string) => string> = {
    tutor_de: (d) => (d === 'origen' ? 'Es tutor de' : 'Su tutor es'),
    conyuge_de: () => 'Cónyuge de',
    hermano_de: () => 'Hermano/a de',
  }

  return (
    <section>
      <h2 className="text-sm font-semibold tracking-tight">Vínculos familiares</h2>
      {familia.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Sin vínculos familiares cargados.</p>
      ) : (
        <ul className="mt-3 divide-y rounded-xl border bg-card shadow-xs">
          {familia.map((f) => (
            <li key={`${f.id}-${f.direccion}`} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-muted-foreground">{LABELS[f.kind]?.(f.direccion) ?? f.kind}</span>
              <Link href={`/${clubSlug}/personas/${f.otraPersonaId}`} className="font-medium hover:underline">
                {f.otraPersonaNombre}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <VinculoForm clubSlug={clubSlug} personId={personId} />
    </section>
  )
}

async function DeportivoTab({
  clubId,
  clubSlug,
  personId,
}: {
  clubId: string
  clubSlug: string
  personId: string
}) {
  const [roles, categorias] = await Promise.all([
    obtenerRoles(clubId, personId),
    listarCategorias(clubId, { soloActivas: true }),
  ])

  return (
    <section>
      <h2 className="text-sm font-semibold tracking-tight">Roles</h2>
      {roles.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Sin roles cargados.</p>
      ) : (
        <ul className="mt-3 divide-y rounded-xl border bg-card shadow-xs">
          {roles.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span className="font-medium">{r.role}</span>
              <span className="text-xs text-muted-foreground">
                {r.categoria ? `${r.categoria} · ` : ''}desde {r.validFrom}
                {r.validTo ? ` hasta ${r.validTo}` : ' (vigente)'}
              </span>
            </li>
          ))}
        </ul>
      )}
      <RolForm clubSlug={clubSlug} personId={personId} categorias={categorias} />
    </section>
  )
}

async function HistorialTab({ clubId, personId }: { clubId: string; personId: string }) {
  const filas = (await obtenerHistorialAuditoria(clubId, personId)) as Record<string, unknown>[]

  if (filas.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin cambios registrados todavía.</p>
  }

  return (
    <ul className="divide-y rounded-xl border bg-card shadow-xs">
      {filas.map((f) => (
        <li key={String(f.id)} className="px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">
              {String(f.entity)} · {String(f.action)}
            </span>
            <span className="text-xs text-muted-foreground">{String(f.at)}</span>
          </div>
          {f.diff !== null && f.diff !== undefined && (
            <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/60 p-3 text-xs">
              {JSON.stringify(f.diff, null, 2)}
            </pre>
          )}
        </li>
      ))}
    </ul>
  )
}
