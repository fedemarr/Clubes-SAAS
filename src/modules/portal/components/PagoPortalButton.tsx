'use client'

import { useState } from 'react'
import { Loader2, Lock } from 'lucide-react'
import { crearLinkPago } from '../actions'
import { Button } from '@/components/ui/button'

export function PagoPortalButton({
  clubSlug,
  accountId,
  montoCents,
}: {
  clubSlug: string
  accountId: string
  montoCents: number
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pagar() {
    setLoading(true)
    setError(null)
    const r = await crearLinkPago(clubSlug, { accountId, montoCents })
    setLoading(false)
    if (!r.ok) {
      setError(r.error)
      return
    }
    window.location.href = r.data.url
  }

  return (
    <div>
      <Button className="w-full" onClick={pagar} disabled={loading || montoCents <= 0}>
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
        {loading ? 'Preparando pago…' : 'Pagar ahora'}
      </Button>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  )
}
