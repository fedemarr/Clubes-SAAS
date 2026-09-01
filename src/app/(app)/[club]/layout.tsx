import { and, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Bell, FileText, Home, IdCard, Wallet } from 'lucide-react'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { auth } from '@/lib/auth/config'
import { checkPermission } from '@/lib/permissions'
import { rolesEnClub, STAFF_ROLES } from '@/lib/permissions'
import { esSuperAdmin } from '@/lib/super-admin'
import { brandTokens } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { AppNav, type NavItem } from '@/components/app-nav'
import { SignOutButton } from '@/components/sign-out-button'
import { MemberRedirect } from './MemberRedirect'

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/personas', label: 'Personas', icon: 'personas' },
  { href: '/categorias', label: 'Categorías', icon: 'categorias' },
  { href: '/calendario', label: 'Calendario', icon: 'calendario' },
  { href: '/cuotas', label: 'Cuotas', icon: 'cuotas' },
  { href: '/documentos', label: 'Documentos', icon: 'documentos' },
  { href: '/notificaciones', label: 'Notificaciones', icon: 'notificaciones' },
]

const PORTAL_NAV = [
  { href: '/portal', label: 'Inicio', icon: Home },
  { href: '/portal/carnet', label: 'Carnet', icon: IdCard },
  { href: '/portal/pagos', label: 'Pagos', icon: Wallet },
  { href: '/portal/documentos', label: 'Documentos', icon: FileText },
  { href: '/notificaciones', label: 'Notificaciones', icon: Bell },
]

function PortalShell({ slug, clubName, logoUrl, timezone, children }: {
  slug: string
  clubName: string
  logoUrl: string | null
  timezone: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" width={26} height={26} className="rounded-full ring-1 ring-foreground/10" />
            )}
            <Link href={`/${slug}/portal`} className="truncate text-sm font-semibold tracking-tight">
              {clubName}
            </Link>
            <span className="hidden text-[11px] text-muted-foreground sm:inline">{timezone}</span>
          </div>
          <SignOutButton />
        </div>
        <div className="mx-auto max-w-3xl overflow-x-auto px-3">
          <div className="flex items-center gap-1 py-1.5">
            {PORTAL_NAV.map((item) => (
              <Link
                key={item.href}
                href={`/${slug}${item.href}`}
                className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <item.icon className="size-4" />
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 lg:py-8">{children}</main>
    </div>
  )
}

export default async function ClubLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ club: string }>
}) {
  const { club: slug } = await params
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }

  // clubs no tiene club_id (es la tabla raíz del tenant): no lleva RLS,
  // se puede leer directo sin pasar por withTenant().
  const [club] = await db
    .select()
    .from(clubs)
    .where(and(eq(clubs.slug, slug), isNull(clubs.deletedAt)))
    .limit(1)

  if (!club) {
    notFound()
  }

  const ctx = await rolesEnClub(slug)
  // El super admin (M9) no tiene persona en el club pero opera como staff
  // sobre cualquier tenant (M10): entra al shell del backoffice igual.
  const sa = ctx ? null : await esSuperAdmin()
  if (!ctx && !sa) notFound()

  const esStaff = ctx ? ctx.roles.some((r) => STAFF_ROLES.has(r)) : true
  if (!esStaff) {
    // Shell del portal para socios/tutores (M6).
    return (
      <div style={brandTokens(club.branding?.primary ?? '#111827')} className="min-h-dvh bg-background">
        <MemberRedirect />
        <PortalShell
          slug={slug}
          clubName={club.name}
          logoUrl={club.logoUrl}
          timezone={club.timezone}
        >
          {children}
        </PortalShell>
      </div>
    )
  }

  const puedeCobranzas = await checkPermission('cobranzas.ver', { kind: 'club' }, slug)
  const puedeMorosidad = await checkPermission('morosidad.ver', { kind: 'club' }, slug)
  const puedeImportador = (await checkPermission('importador.usar', { kind: 'club' }, slug)) ?? sa
  let nav: NavItem[] = NAV
  if (puedeCobranzas) nav = [...nav, { href: '/cuotas/cobranzas', label: 'Cobranzas', icon: 'cobranzas' }]
  if (puedeMorosidad) nav = [...nav, { href: '/cuotas/morosidad', label: 'Morosidad', icon: 'morosidad' }]
  if (puedeImportador) nav = [...nav, { href: '/admin/importador', label: 'Importador', icon: 'importador' }]

  const primary = club.branding?.primary ?? '#111827'
  const brandStyle = brandTokens(primary)

  return (
    <div style={brandStyle} className="min-h-dvh bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b px-4">
          {club.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={club.logoUrl} alt="" width={28} height={28} className="rounded-full ring-1 ring-foreground/10" />
          )}
          <Link href={`/${slug}/dashboard`} className="truncate text-sm font-semibold tracking-tight">
            {club.name}
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <AppNav clubSlug={slug} items={nav} vertical />
        </div>

        <div className="shrink-0 border-t p-3">
          <div className="mb-2 flex items-center gap-2.5 px-3 py-1">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {session.user.email?.charAt(0).toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-foreground">{session.user.email}</p>
              <p className="text-[11px] text-muted-foreground">{club.timezone}</p>
            </div>
          </div>
          <SignOutButton />
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur lg:hidden">
        {club.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={club.logoUrl} alt="" width={26} height={26} className="rounded-full ring-1 ring-foreground/10" />
        )}
        <Link href={`/${slug}/dashboard`} className={cn('text-sm font-semibold tracking-tight')}>
          {club.name}
        </Link>
      </header>
      <div className="sticky top-14 z-20 border-b bg-background/90 backdrop-blur lg:hidden">
        <div className="px-3 py-1.5">
          <AppNav clubSlug={slug} items={nav} />
        </div>
      </div>

      <main className="lg:pl-60">
        <div className="mx-auto max-w-5xl px-4 py-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  )
}
