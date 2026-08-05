import { and, eq, isNull } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { BadgeCheck, Hash, IdCard } from 'lucide-react'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { rolesEnClub } from '@/lib/permissions'
import { datosCarnet } from '@/modules/portal/queries'
import { QrCarnet } from '@/modules/portal/components/QrCarnet'
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
  const primary = club.branding?.primary ?? '#111827'

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

      <section
        className="overflow-hidden rounded-2xl text-primary-foreground shadow-md"
        style={{
          background: `linear-gradient(135deg, ${primary} 0%, color-mix(in oklab, ${primary} 60%, #000) 100%)`,
        }}
      >
        <div className="flex items-center justify-between gap-3 p-5">
          <div className="flex min-w-0 items-center gap-2.5">
            {club.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={club.logoUrl}
                alt=""
                width={32}
                height={32}
                className="rounded-full bg-white/20 ring-1 ring-white/30"
              />
            )}
            <span className="truncate text-sm font-semibold tracking-tight">{club.name}</span>
          </div>
          <Badge className="bg-white/15 text-primary-foreground ring-1 ring-white/30" variant="outline">
            Carnet digital
          </Badge>
        </div>

        <div className="grid gap-5 p-5 sm:grid-cols-[1fr_auto]">
          <div className="flex items-center gap-4">
            <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/15 text-2xl font-bold ring-1 ring-white/30">
              {p.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.photoUrl} alt="" className="size-full object-cover" />
              ) : (
                iniciales
              )}
            </div>
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
