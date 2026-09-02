import { and, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Gift,
  MapPin,
  Trophy,
  Wallet,
} from 'lucide-react'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { rolesEnClub } from '@/lib/permissions'
import { formatARS } from '@/lib/money'
import { datosPortal, type CuentaPortal } from '@/modules/portal/queries'
import { listarBeneficios } from '@/modules/beneficios/queries'
import { PagoPortalButton } from '@/modules/portal/components/PagoPortalButton'
import { CredencialAcceso } from '@/modules/portal/components/CredencialAcceso'
import { AvatarFoto } from '@/modules/portal/components/AvatarFoto'
import { SemaforoBadge, semaforoCuenta, semaforoFamilia } from '@/modules/portal/components/semaforo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'

export const dynamic = 'force-dynamic'

const KIND_LABEL: Record<string, string> = {
  entrenamiento: 'Entrenamiento',
  partido: 'Partido',
  cena: 'Cena',
  asamblea: 'Asamblea',
  buffet: 'Turno de buffet',
}

function formatearFecha(fecha: Date, timezone: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }).format(fecha)
}

function CuentaCard({ slug, cuenta }: { slug: string; cuenta: CuentaPortal }) {
  const estado = semaforoCuenta(cuenta)
  const vencidos = cuenta.cargos.filter((c) => c.status === 'vencido')

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold tracking-tight dark:text-white">{cuenta.label ?? cuenta.holderNombre}</p>
          <p className="text-xs text-muted-foreground">{cuenta.holderNombre}</p>
        </div>
        <SemaforoBadge tono={estado.tono} label={estado.label} />
      </div>

      <p className={`mt-4 text-3xl font-semibold tabular-nums ${estado.tono === 'verde' ? '' : 'text-destructive'}`}>
        {formatARS(cuenta.balanceCents)}
      </p>
      <p className="text-xs text-muted-foreground">{estado.tono === 'verde' ? 'Sin deuda en la cuenta' : 'Saldo pendiente'}</p>

      {cuenta.cargos.length > 0 && (
        <ul className="mt-4 divide-y text-sm">
          {cuenta.cargos.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate">{c.concept}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-muted-foreground">{formatARS(c.amountCents)}</span>
                <Badge variant={c.status === 'vencido' ? 'destructive' : 'outline'}>
                  {c.status === 'pendiente' ? 'Pendiente' : c.status === 'parcial' ? 'Parcial' : 'Vencido'}
                </Badge>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        <PagoPortalButton clubSlug={slug} accountId={cuenta.accountId} montoCents={cuenta.balanceCents} />
        {cuenta.balanceCents > 0 && (
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Se paga con Mercado Pago (o transferencia al CVU del club). Se acredita automáticamente.
          </p>
        )}
      </div>

      {vencidos.length > 0 && (
        <p className="mt-3 text-xs text-destructive">
          {vencidos.length} {vencidos.length === 1 ? 'cargo vencido' : 'cargos vencidos'} · el club te avisa por
          WhatsApp.
        </p>
      )}
    </section>
  )
}

function BeneficioIcono() {
  return <Gift className="size-5 text-primary" />
}

export default async function PortalHomePage({ params }: { params: Promise<{ club: string }> }) {
  const { club: slug } = await params

  const ctx = await rolesEnClub(slug)
  if (!ctx) redirect('/')

  const [club] = await db
    .select()
    .from(clubs)
    .where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)))
    .limit(1)
  if (!club) redirect('/')

  const datos = await datosPortal(ctx.clubId, ctx.personId)
  const beneficios = await listarBeneficios(ctx.clubId)
  const estadoCta = semaforoFamilia(datos.cuentas)
  const primary = club.branding?.primary ?? '#111827'
  const p = datos.persona
  const iniciales = `${p.firstName.charAt(0)}${p.lastName.charAt(0)}`.toUpperCase()
  const documento = `${p.docType} ${p.docNumber ?? '—'}`
  const vencimientoDia = club.financeConfig?.vencimientoDia ?? 10

  return (
    <div className="grid gap-6">
      {/* Encabezado de perfil grande */}
      <section
        className="overflow-hidden rounded-2xl p-5 text-primary-foreground shadow-md sm:p-6"
        style={{
          background: `linear-gradient(135deg, ${primary} 0%, color-mix(in oklab, ${primary} 60%, #000) 100%)`,
        }}
      >
        <div className="flex flex-wrap items-center gap-4">
          <AvatarFoto clubSlug={slug} photoUrl={p.photoUrl} iniciales={iniciales} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-2xl font-semibold tracking-tight">
              {p.firstName} {p.lastName}
            </p>
            <p className="mt-0.5 text-sm text-primary-foreground/85">{documento}</p>
            {datos.categorias.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {datos.categorias.slice(0, 3).map((c) => (
                  <span
                    key={c.teamId}
                    className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium ring-1 ring-white/25"
                  >
                    {c.label}
                    {c.sport ? ` · ${c.sport}` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
          <SemaforoBadge
            tono={estadoCta.tono}
            label={estadoCta.label}
            sobreFondoColor
            className="bg-white/15 text-white ring-1 ring-white/25"
          />
        </div>
      </section>

      {/* Estado de cuota: semáforo + débito automático (visual) */}
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {estadoCta.tono === 'verde' ? (
              <CheckCircle2 className="size-5 text-green-600" />
            ) : (
              <CreditCard className="size-5 text-primary" />
            )}
            <p className="text-sm font-semibold tracking-tight dark:text-white">Cuota</p>
          </div>
          <SemaforoBadge tono={estadoCta.tono} label={estadoCta.label} />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {estadoCta.tono === 'verde'
            ? 'Estás al día — no tenés cuotas pendientes.'
            : estadoCta.tono === 'amarillo'
              ? 'Tenés cuotas por vencer. Pagá antes del día ' + vencimientoDia + ' de cada mes.'
              : 'Tenés cuotas vencidas. El club te va a avisar por WhatsApp.'}
        </p>

        {datos.cuotaPlan && (
          <div className="mt-4 grid gap-4 rounded-xl border border-dashed p-4 sm:grid-cols-[1fr_auto]">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold tracking-tight dark:text-white">
                <CreditCard className="size-4 text-primary" />
                Débito automático
                <span className="rounded-full bg-green-600/15 px-2 py-0.5 text-[11px] font-semibold text-green-700 dark:text-green-300">
                  Activo
                </span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Tu cuota ({datos.cuotaPlan.planNombre}) se cobra sola cada mes{' '}
                <span className="font-semibold tabular-nums text-foreground">
                  {formatARS(datos.cuotaPlan.montoCents)}
                </span>
                {' '}siempre que estés al día.
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Gestión visual por ahora — la activación real llega próximamente.
              </p>
            </div>
            <div className="flex items-center">
              <Button variant="outline" disabled>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Credencial digital con QR prominente */}
      <CredencialAcceso
        clubSlug={slug}
        nombre={`${p.firstName} ${p.lastName}`.trim()}
        documento={documento}
        miembro={
          datos.categorias.length > 0
            ? datos.categorias.map((c) => c.label).join(' · ')
            : 'Socio del club'
        }
      />

      {beneficios.length > 0 && (
        <section className="grid gap-3">
          <div className="flex items-center gap-2">
            <Gift className="size-4 text-primary" />
            <p className="text-sm font-semibold tracking-tight dark:text-white">Beneficios para socios</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {beneficios.map((b) => (
              <div key={b.id} className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <BeneficioIcono />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold tracking-tight dark:text-white">{b.title}</p>
                    {b.description && <p className="mt-1 text-xs text-muted-foreground">{b.description}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {datos.proximoEvento ? (
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight dark:text-white">
            <CalendarDays className="size-4 text-primary" />
            Próximo evento
          </div>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold tracking-tight dark:text-white">
                {datos.proximoEvento.title ?? KIND_LABEL[datos.proximoEvento.kind] ?? 'Evento'}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span>{formatearFecha(datos.proximoEvento.startsAt, club.timezone)}</span>
                {datos.proximoEvento.categoriaLabel && (
                  <span className="inline-flex items-center gap-1">
                    <Trophy className="size-3.5" />
                    {datos.proximoEvento.categoriaLabel}
                  </span>
                )}
                {datos.proximoEvento.opponent && <span>vs. {datos.proximoEvento.opponent}</span>}
                {datos.proximoEvento.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5" />
                    {datos.proximoEvento.location}
                  </span>
                )}
              </p>
            </div>
            <Badge variant="outline">{KIND_LABEL[datos.proximoEvento.kind] ?? datos.proximoEvento.kind}</Badge>
          </div>
        </section>
      ) : (
        <EmptyState
          title="Sin próximos eventos"
          description="Cuando te programen un entrenamiento o partido, lo vas a ver acá."
          icon={CalendarDays}
        />
      )}

      {datos.cuentas.length > 0 ? (
        <div className="grid gap-4">
          {datos.cuentas.map((c) => (
            <CuentaCard key={c.accountId} slug={slug} cuenta={c} />
          ))}
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Wallet className="size-3.5" />
            ¿Querés ver todo el detalle?
            <Link href={`/${slug}/portal/pagos`} className="font-medium text-primary underline-offset-4 hover:underline">
              Andá a Pagos
            </Link>
          </p>
        </div>
      ) : (
        <section className="rounded-xl border border-dashed bg-card/50 p-6 text-center">
          <Wallet className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Todavía no tenés ninguna cuenta asociada. Hablá con el club si creés que es un error.
          </p>
        </section>
      )}
    </div>
  )
}