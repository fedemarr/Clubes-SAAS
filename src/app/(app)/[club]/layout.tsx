import { and, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { db } from '@/db/client'
import { clubs } from '@/db/schema'
import { auth } from '@/lib/auth/config'
import { checkPermission } from '@/lib/permissions'
import { brandTokens } from '@/lib/theme'
import { cn } from '@/lib/utils'

const NAV: { href: string; label: string }[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/personas', label: 'Personas' },
  { href: '/categorias', label: 'Categorías' },
  { href: '/calendario', label: 'Calendario' },
  { href: '/cuotas', label: 'Cuotas' },
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
  const nav = puedeCobranzas ? [...NAV, { href: '/cuotas/cobranzas', label: 'Cobranzas' }] : NAV

  const primary = club.branding?.primary ?? '#111827'
  const brandStyle = brandTokens(primary)

  return (
    <div style={brandStyle}>
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          {club.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={club.logoUrl} alt="" width={28} height={28} className="rounded-full" />
          )}
          <Link href={`/${slug}/dashboard`} className="text-sm font-semibold tracking-tight">
            {club.name}
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={`/${slug}${item.href}`}
                className={cn(
                  'rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto" />
          <span className="hidden text-xs text-muted-foreground sm:inline">{club.timezone}</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  )
}
