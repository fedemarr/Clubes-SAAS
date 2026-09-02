import { and, eq, isNull } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { BadgeCheck, ChevronRight, Hash, IdCard, ShoppingBag, Trophy } from 'lucide-react'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { rolesEnClub } from '@/lib/permissions'
import { datosCarnet } from '@/modules/portal/queries'
import { QrCarnet } from '@/modules/portal/components/QrCarnet'
import { AvatarFoto } from '@/modules/portal/components/AvatarFoto'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

const ESTADO_LABEL: Record<string, string> = {
  activa: 'Membresía activa',
  pendiente: 'Pendiente de aprobación',
  suspendida: 'Suspendida',
  baja: 'Baja',
}

export default async function CarnetPage({ params }: { params: Promise<{ club: string }> }) {
  const { club: slug } = await params

  const ctx = await rolesEnClub(slug)
  if (!ctx) redirect('/')

  const [club] = await db
    .select()
    .from(clubs)
    .where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)))
    .limit(1)
  if (!club) redirect('/')

  const datos = await datosCarnet(ctx.clubId, ctx.personId)
  const p = datos.persona
  const iniciales = `${p.firstName.charAt(0)}${p.lastName.charAt(0)}`.toUpperCase()
  // `liveUrl` no está en el tipo de schema.ts (branding: {primary,secondary,tagline}):
  // es jsonb sin validar en runtime, así que se lee con un cast local en vez de
  // tocar schema.ts (regla no negociable) — ver DECISIONS.md, mismo criterio
  // que otras columnas jsonb flexibles del proyecto.
  const branding = club.branding as { primary?: string; secondary?: string; tagline?: string; liveUrl?: string } | null
  const primary = branding?.primary ?? '#111827'
  const secondary = branding?.secondary ?? '#eab308'
  const liveUrl = branding?.liveUrl

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <IdCard className="size-6 text-primary" />
          Carnet digital
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Mostrá este código para entrar al club. El QR cambia cada 30 segundos.
        </p>
      </div>

      {/* Carnet: borde degradé (marca -> dorado) envolviendo el gradiente principal, estilo gift card. */}
      <div
        className="rounded-[22px] p-[2px] shadow-md"
        style={{ background: `linear-gradient(135deg, ${secondary} 0%, ${primary} 60%)` }}
      >
        <section
          className="relative overflow-hidden rounded-[20px] text-primary-foreground"
          style={{
            background: `linear-gradient(135deg, ${primary} 0%, color-mix(in oklab, ${primary} 55%, #000) 75%, #000 130%)`,
          }}
        >
          {club.logoUrl && (
            // Escudo grande centrado como fondo de toda la card (estilo
            // gift card): antes era chico y arrinconado arriba a la
            // derecha, ahora ocupa casi toda la superficie detrás del
            // contenido, bien tenue para no restarle legibilidad al texto.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={club.logoUrl}
              alt=""
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-1/2 h-[95%] w-auto -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.16]"
            />
          )}

          <div className="relative flex items-center justify-between gap-3 p-5">
            <span className="text-[10px] font-bold tracking-[0.16em] text-primary-foreground/75 uppercase">
              Socio titular
            </span>
            <Badge className="border-0" style={{ background: secondary, color: '#111827' }}>
              Activo
            </Badge>
          </div>

          <div className="relative grid gap-5 px-5 pb-5 sm:grid-cols-[1fr_auto]">
            <div className="flex items-center gap-4">
              <AvatarFoto clubSlug={slug} photoUrl={p.photoUrl} iniciales={iniciales} size="md" />
              <div className="min-w-0">
                <p className="truncate text-xl font-semibold tracking-tight">
                  {p.firstName} {p.lastName}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-primary-foreground/80">
                  <Hash className="size-3.5" />
                  {p.memberNumber ? `Socio Nº ${p.memberNumber}` : 'Sin número de socio'}
                </p>
                <p className="text-sm text-primary-foreground/80">
                  {p.docType} {p.docNumber ?? '—'}
                </p>
                {p.bornOn && (
                  <p className="text-sm text-primary-foreground/80">
                    {new Date(p.bornOn + 'T12:00:00Z').toLocaleDateString('es-AR', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                )}
              </div>
            </div>
            <QrCarnet clubSlug={slug} />
          </div>
        </section>
      </div>

      {/* Accesos rápidos del club. */}
      <a
        href={liveUrl || '#'}
        target={liveUrl ? '_blank' : undefined}
        rel={liveUrl ? 'noreferrer' : undefined}
        className="flex items-center gap-3 rounded-xl p-4 text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
        style={{ background: `linear-gradient(120deg, ${primary} 0%, color-mix(in oklab, ${primary} 55%, #000) 100%)` }}
      >
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `color-mix(in oklab, ${secondary} 22%, transparent)` }}
        >
          <Trophy className="size-5" style={{ color: secondary }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Ver partidos en vivo</p>
          <p className="text-xs text-primary-foreground/75">Resultados, estadísticas y posiciones</p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-primary-foreground/60" />
      </a>

      <div className="flex items-center gap-3 rounded-xl border border-dashed bg-card p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <ShoppingBag className="size-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-muted-foreground">Shop del club</p>
          <p className="text-xs text-muted-foreground/80">Indumentaria oficial y más</p>
        </div>
        <Badge variant="outline" className="shrink-0" style={{ color: secondary, borderColor: secondary }}>
          Próximamente
        </Badge>
      </div>

      {datos.categorias.length > 0 && (
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="text-sm font-semibold tracking-tight">Categorías</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {datos.categorias.map((c) => (
              <Badge key={c.teamId} variant="outline">
                {c.label} · {c.sport}
              </Badge>
            ))}
          </div>
        </section>
      )}

      {datos.membresias.length > 0 && (
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="text-sm font-semibold tracking-tight">Membresías</p>
          <ul className="mt-3 divide-y text-sm">
            {datos.membresias.map((m, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate">
                  {m.planNombre}
                  {m.sport ? ` · ${m.sport}` : ''}
                </span>
                <Badge variant="outline">
                  <BadgeCheck className="mr-1 size-3.5" />
                  {ESTADO_LABEL[m.status] ?? m.status}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
