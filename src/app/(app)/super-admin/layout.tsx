import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Shield, Building2, ScrollText } from 'lucide-react'
import { auth } from '@/lib/auth/config'
import { esSuperAdmin } from '@/lib/super-admin'
import { SignOutButton } from '@/components/sign-out-button'

const SA_NAV = [
  { href: '/super-admin', label: 'Clubs', icon: Building2 },
  { href: '/super-admin/auditoria', label: 'Auditoría', icon: ScrollText },
]

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const sa = await esSuperAdmin()
  if (!sa) {
    redirect('/') // no revela que existe el área
  }

  return (
    <div className="min-h-dvh bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b px-4">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Shield className="size-4" />
          </div>
          <span className="truncate text-sm font-semibold tracking-tight">Super Admin</span>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          <div className="flex flex-col gap-1">
            {SA_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <item.icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            ))}
          </div>
        </nav>

        <div className="shrink-0 border-t p-3">
          <div className="mb-2 flex items-center gap-2.5 px-3 py-1">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {sa.email.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-foreground">{sa.email}</p>
              <p className="text-[11px] text-muted-foreground">Super admin</p>
            </div>
          </div>
          <SignOutButton />
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur md:hidden">
        <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Shield className="size-4" />
        </div>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">Super Admin</p>
        <SignOutButton />
      </header>

      <main className="md:pl-60">
        <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  )
}