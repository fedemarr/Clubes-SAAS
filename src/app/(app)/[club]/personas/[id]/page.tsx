import { and, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { checkPermission } from '@/lib/permissions'
import { listarCategorias } from '@/modules/categorias/queries'
import { EstadoBadge } from '@/modules/personas/components/EstadoBadge'
import { RolForm } from '@/modules/personas/components/RolForm'
import { VinculoForm } from '@/modules/personas/components/VinculoForm'
import { obtenerFamilia, obtenerHistorialAuditoria, obtenerPersona, obtenerRoles } from '@/modules/personas/queries'

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
  if (!ctx) return <main style={{ padding: '1rem' }}>No tenés permiso para ver esta ficha.</main>

  const [club] = await db.select().from(clubs).where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt))).limit(1)
  if (!club) return null

  const persona = await obtenerPersona(club.id, id)
  if (!persona) notFound()

  return (
    <main style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h1>
          {persona.lastName}, {persona.firstName}
        </h1>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <EstadoBadge status={persona.status} />
          <Link href={`/${slug}/personas/${id}/editar`}>Editar</Link>
        </div>
      </div>

      <nav style={{ display: 'flex', gap: '0.75rem', borderBottom: '1px solid #e5e7eb', margin: '1rem 0', flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/${slug}/personas/${id}?tab=${t.id}`}
            style={{
              padding: '0.5rem 0',
              borderBottom: t.id === tabActivo ? '2px solid #1F5C3F' : '2px solid transparent',
              fontWeight: t.id === tabActivo ? 600 : 400,
              color: 'inherit',
              textDecoration: 'none',
            }}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tabActivo === 'datos' && (
        <dl>
          <dt>Documento</dt>
          <dd>
            {persona.docType} {persona.docNumber ?? '—'}
          </dd>
          <dt>Fecha de nacimiento</dt>
          <dd>{persona.bornOn ?? '—'}</dd>
          <dt>Email</dt>
          <dd>{persona.email ?? '—'}</dd>
          <dt>Teléfono</dt>
          <dd>{persona.phone ?? '—'}</dd>
          <dt>N° de socio</dt>
          <dd>{persona.memberNumber ?? '—'}</dd>
        </dl>
      )}

      {tabActivo === 'familia' && <FamiliaTab clubSlug={slug} personId={id} />}

      {tabActivo === 'deportivo' && <DeportivoTab clubId={club.id} clubSlug={slug} personId={id} />}

      {tabActivo === 'financiero' && <p>Todavía no disponible — llega con el módulo de cuotas (M3).</p>}

      {tabActivo === 'documentos' && <p>Todavía no disponible — llega con el módulo de documentos (M7).</p>}

      {tabActivo === 'historial' && <HistorialTab clubId={club.id} personId={id} />}
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
    <div>
      {familia.length === 0 && <p>Sin vínculos familiares cargados.</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {familia.map((f) => (
          <li key={`${f.id}-${f.direccion}`}>
            {LABELS[f.kind]?.(f.direccion) ?? f.kind}{' '}
            <Link href={`/${clubSlug}/personas/${f.otraPersonaId}`}>{f.otraPersonaNombre}</Link>
          </li>
        ))}
      </ul>
      <VinculoForm clubSlug={clubSlug} personId={personId} />
    </div>
  )
}

async function DeportivoTab({ clubId, clubSlug, personId }: { clubId: string; clubSlug: string; personId: string }) {
  const [roles, categorias] = await Promise.all([
    obtenerRoles(clubId, personId),
    listarCategorias(clubId, { soloActivas: true }),
  ])

  return (
    <div>
      <h3>Roles</h3>
      {roles.length === 0 && <p>Sin roles cargados.</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {roles.map((r) => (
          <li key={r.id}>
            {r.role} {r.categoria ? `· ${r.categoria}` : ''} — desde {r.validFrom}
            {r.validTo ? ` hasta ${r.validTo}` : ' (vigente)'}
          </li>
        ))}
      </ul>
      <RolForm clubSlug={clubSlug} personId={personId} categorias={categorias} />
    </div>
  )
}

async function HistorialTab({ clubId, personId }: { clubId: string; personId: string }) {
  const filas = (await obtenerHistorialAuditoria(clubId, personId)) as Record<string, unknown>[]

  if (filas.length === 0) return <p>Sin cambios registrados todavía.</p>

  return (
    <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.5rem' }}>
      {filas.map((f) => (
        <li key={String(f.id)} style={{ borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>
          <small>{String(f.at)}</small>
          <br />
          <strong>
            {String(f.entity)} · {String(f.action)}
          </strong>
          {f.diff !== null && (
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}>{JSON.stringify(f.diff, null, 2)}</pre>
          )}
        </li>
      ))}
    </ul>
  )
}
