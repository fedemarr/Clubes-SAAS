'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/cuotas', label: 'Planes' },
  { href: '/cuotas/generar', label: 'Generar' },
  { href: '/cuotas/membresias', label: 'Membresías' },
  { href: '/cuotas/cuentas', label: 'Cuenta corriente' },
  { href: '/cuotas/cobrar', label: 'Cobrar' },
  { href: '/cuotas/cobranzas', label: 'Cobranzas' },
  { href: '/cuotas/morosidad', label: 'Morosidad' },
] as const

/**
 * Barra de tabs de navegación del módulo Cuotas (M15): da acceso visual a las
 * secciones existentes sin duplicar contenido. Marca la tab según el pathname
 * actual (prefix match para subrutas como /cuotas/cuentas/[id]).
 */
export function CuotasNav({ clubSlug }: { clubSlug: string }) {
  const pathname = usePathname()

  function activo(href: string): boolean {
    if (href === '/cuotas') return pathname === `/${clubSlug}/cuotas`
    return pathname.startsWith(`/${clubSlug}${href}`)
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b pb-0">
      {TABS.map((t) => {
        const activa = activo(t.href)
        return (
          <Link
            key={t.href}
            href={`/${clubSlug}${t.href}`}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              activa
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}