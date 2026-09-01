'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Bell,
  CalendarDays,
  FileText,
  HandCoins,
  LayoutDashboard,
  AlertTriangle,
  Trophy,
  Upload,
  Users,
  Wallet,
  Download,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type NavIcon =
  | 'dashboard'
  | 'personas'
  | 'categorias'
  | 'calendario'
  | 'cuotas'
  | 'cobranzas'
  | 'morosidad'
  | 'notificaciones'
  | 'documentos'
  | 'importador'
  | 'exportar'

const ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  personas: Users,
  categorias: Trophy,
  calendario: CalendarDays,
  cuotas: Wallet,
  cobranzas: HandCoins,
  morosidad: AlertTriangle,
  notificaciones: Bell,
  documentos: FileText,
  importador: Upload,
  exportar: Download,
}

export type NavItem = {
  href: string
  label: string
  icon: NavIcon
}

function isActive(pathname: string, items: NavItem[], item: NavItem): boolean {
  if (pathname === item.href) return true
  if (!pathname.startsWith(item.href + '/')) return false
  const masEspecifico = items.find(
    (o) => o.href.length > item.href.length && pathname.startsWith(o.href + '/'),
  )
  return !masEspecifico
}

export function AppNav({
  clubSlug,
  items,
  vertical,
}: {
  clubSlug: string
  items: NavItem[]
  vertical?: boolean
}) {
  const pathname = usePathname()

  return (
    <nav
      className={cn(
        'flex items-center gap-1',
        vertical ? 'flex-col items-stretch gap-1' : 'overflow-x-auto lg:hidden',
      )}
    >
      {items.map((item) => {
        const active = isActive(pathname, items, item)
        const Icon = ICONS[item.icon]
        return (
          <Link
            key={item.href}
            href={`/${clubSlug}${item.href}`}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              vertical ? 'shrink-0' : 'shrink-0 whitespace-nowrap',
              active
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
