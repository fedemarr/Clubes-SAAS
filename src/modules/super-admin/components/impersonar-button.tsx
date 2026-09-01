'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { UserCheck } from 'lucide-react'
import { iniciarImpersonacion } from '../actions'
import { Button } from '@/components/ui/button'

/**
 * Botón "Impersonar" del drill-down de super admin. Inicia la impersonación
 * de una persona del club y redirige a /[club]/dashboard para operar en vivo
 * con la identidad efectiva de esa persona (M14).
 */
export function ImpersonarButton({
  slug,
  personaId,
  tipo,
  disabled,
}: {
  slug: string
  personaId: string
  tipo: 'staff' | 'socio'
  disabled?: boolean
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onClick() {
    setError(null)
    setLoading(true)
    const res = await iniciarImpersonacion(slug, { personaId, tipo })
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    router.push(`/${slug}/dashboard`)
  }

  return (
    <div className="flex items-center justify-end">
      <Button size="sm" variant="outline" onClick={() => void onClick()} disabled={disabled || loading}>
        <UserCheck data-icon="inline-start" />
        {loading ? 'Entrando…' : 'Impersonar'}
      </Button>
      {error && <span className="ml-2 text-xs text-red-600">{error}</span>}
    </div>
  )
}