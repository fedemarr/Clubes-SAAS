'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, FileText, Home, IdCard, Wallet, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// Los ícones se resuelven acá adentro por clave string, no se pasan como
// referencia de componente: un Server Component no puede mandarle una
// función/componente a un Client Component ("use client") como prop, RSC
// no lo serializa (mismo patrón que ICONS en components/app-nav.tsx).
export type PortalNavIcon = 'inicio' | 'carnet' | 'pagos' | 'documentos' | 'notificaciones'

const ICONS: Record<PortalNavIcon, LucideIcon> = {
  inicio: Home,
  carnet: IdCard,
  pagos: Wallet,
  documentos: FileText,
  notificaciones: Bell,
}

export type PortalNavItem = {
  href: string
  label: string
  icon: PortalNavIcon
}

function isActive(pathname: string, items: PortalNavItem[], item: PortalNavItem): boolean {
  if (pathname === item.href) return true
  if (!pathname.startsWith(item.href + '/')) return false
  const masEspecifico = items.find((o) => o.href.length > item.href.length && pathname.startsWith(o.href + '/'))
  return !masEspecifico
}

/**
 * Nav del portal del socio, fija abajo (mobile-first: mismo patrón que
 * cualquier app de consumo, y evita el desborde horizontal que tenía la
 * fila de arriba con 5 ítems de texto). El layout agrega padding-bottom
 * al <main> para que el contenido no quede tapado detrás.
 */
export function PortalBottomNav({ clubSlug, items }: { clubSlug: string; items: PortalNavItem[] }) {
  const pathname = usePathname()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur [padding-bottom:env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-3xl items-stretch justify-around">
        {items.map((item) => {
          const active = isActive(pathname, items, item)
          const Icon = ICONS[item.icon]
          return (
            <Link
              key={item.href}
              href={`/${clubSlug}${item.href}`}
              className={cn(
                'flex min-w-0 flex-1 flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium transition-colors',
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-5" />
              <span className="truncate px-1">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
