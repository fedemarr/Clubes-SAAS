import { and, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { auth } from '@/lib/auth/config'
import { checkPermission } from '@/lib/permissions'
import { brandTokens } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { AppNav, type NavItem } from '@/components/app-nav'
import { SignOutButton } from '@/components/sign-out-button'

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/personas', label: 'Personas', icon: 'personas' },
  { href: '/categorias', label: 'Categorías', icon: 'categorias' },
  { href: '/calendario', label: 'Calendario', icon: 'calendario' },
  { href: '/cuotas', label: 'Cuotas', icon: 'cuotas' },
]

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

  const puedeCobranzas = await checkPermission('cobranzas.ver', { kind: 'club' }, slug)
  const puedeMorosidad = await checkPermission('morosidad.ver', { kind: 'club' }, slug)
  let nav: NavItem[] = NAV
  if (puedeCobranzas) nav = [...nav, { href: '/cuotas/cobranzas', label: 'Cobranzas', icon: 'cobranzas' }]
  if (puedeMorosidad) nav = [...nav, { href: '/cuotas/morosidad', label: 'Morosidad', icon: 'morosidad' }]

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
