'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

const STAFF_PREFIXES = ['/dashboard', '/personas', '/categorias', '/calendario', '/cuotas']

/**
 * Los socios (rol tutor/jugador) no ven el backoffice: si tocan una ruta de
 * staff, se los lleva al portal. Las rutas compartidas (notificaciones,
 * portal) quedan.
 */
export function MemberRedirect() {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (STAFF_PREFIXES.some((p) => pathname.startsWith(p))) {
      router.replace('/portal')
    }
  }, [pathname, router])

  return null
}
